-- T-080 / D-029 (thay phần "tự xóa" của D-027): phiếu/dòng thiếu thông tin KHÔNG bị xóa nữa.
-- Quá 24h mà còn thiếu → người tạo bị khóa thao tác khác (thêm / sửa / xóa phiếu, dòng khác; giữ số TK) cho tới khi điền đủ.
-- Người tạo luôn được sửa chính phiếu/dòng đang thiếu, kể cả khi đã quá 24h (không cần "Yêu cầu sửa").
-- Chỉ chặn thao tác qua web (auth.uid() có giá trị); SQL Editor / lịch không bị chặn. Phụ thuộc 000013, 000015, 000022. Chạy lại được.
begin;

-- ---------- 1. Bỏ lịch tự xóa ----------
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-incomplete';
  end if;
end $$;
drop function if exists public.purge_incomplete();

-- ---------- 2. Người gọi đang bị khóa? ----------
create or replace function public.is_blocked_incomplete()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.transport_plans p
                 where p.require_complete and p.created_by = (select auth.uid())
                   and p.created_at < now() - interval '24 hours' and cardinality(public.plan_missing(p)) > 0)
      or exists (select 1 from public.inspection_details d
                 where d.require_complete and d.created_by = (select auth.uid())
                   and d.created_at < now() - interval '24 hours' and cardinality(public.detail_missing(d)) > 0)
$$;
revoke all on function public.is_blocked_incomplete() from public, anon;
grant execute on function public.is_blocked_incomplete() to authenticated;

-- Bản ghi này là phiếu/dòng còn thiếu của chính người gọi (được sửa / xóa dù đang bị khóa hoặc đã quá 24h).
create or replace function public.is_own_incomplete(p_plan_id bigint, p_detail_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when p_detail_id is not null then
    exists (select 1 from public.inspection_details d where d.id = p_detail_id and d.require_complete
              and d.created_by = (select auth.uid()) and cardinality(public.detail_missing(d)) > 0)
  else
    exists (select 1 from public.transport_plans p where p.id = p_plan_id and p.require_complete
              and p.created_by = (select auth.uid()) and cardinality(public.plan_missing(p)) > 0)
  end
$$;
revoke all on function public.is_own_incomplete(bigint, bigint) from public, anon;
grant execute on function public.is_own_incomplete(bigint, bigint) to authenticated;

-- ---------- 3. Mở sửa cho phiếu/dòng còn thiếu của chính mình (giữ nguyên phần còn lại của 000015) ----------
create or replace function public.can_update_row(p_created_by uuid, p_created_at timestamptz, p_plan_id bigint, p_detail_id bigint default null)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.can_edit_row(p_created_by, p_created_at)
      or coalesce(public.is_active_user()
                  and p_created_by = (select auth.uid())
                  and (exists (select 1 from public.edit_requests r
                               where r.requested_by = (select auth.uid())
                                 and r.status = 'approved' and r.unlock_until > now()
                                 and ((p_plan_id is not null and r.plan_id = p_plan_id)
                                      or (p_detail_id is not null and r.detail_id = p_detail_id)))
                       or public.is_own_incomplete(p_plan_id, p_detail_id)), false)
$$;

-- ---------- 4. Chặn thao tác khác khi đang bị khóa ----------
create or replace function public.guard_blocked_incomplete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_plan bigint; v_detail bigint;
begin
  if (select auth.uid()) is null or not public.is_blocked_incomplete() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op <> 'INSERT' then
    if tg_table_name = 'inspection_details' then v_plan := old.plan_id; v_detail := old.id;
    else v_plan := old.id; v_detail := null; end if;
    if public.is_own_incomplete(v_plan, v_detail) then
      return case when tg_op = 'DELETE' then old else new end;
    end if;
  end if;
  raise exception 'Bạn còn phiếu/dòng quá 24 giờ chưa điền đủ thông tin. Hãy điền đủ trước khi thao tác khác.' using errcode = 'P0001';
end $$;
revoke all on function public.guard_blocked_incomplete() from public, anon, authenticated;

drop trigger if exists transport_plans_guard_blocked on public.transport_plans;
create trigger transport_plans_guard_blocked before insert or update or delete on public.transport_plans
  for each row execute function public.guard_blocked_incomplete();
drop trigger if exists inspection_details_guard_blocked on public.inspection_details;
create trigger inspection_details_guard_blocked before insert or update or delete on public.inspection_details
  for each row execute function public.guard_blocked_incomplete();

-- reserve_tk_number: như 000013, thêm kiểm khóa (không cho bắt đầu phiếu mới).
create or replace function public.reserve_tk_number()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
  v_y int := extract(year from v_now)::int;
  v_m int := extract(month from v_now)::int;
  v_uid uuid := (select auth.uid());
  v_seq int;
begin
  if not public.is_active_user() then
    raise exception 'Bạn không có quyền giữ số phiếu thống kê' using errcode = '42501';
  end if;
  if public.is_blocked_incomplete() then
    raise exception 'Bạn còn phiếu/dòng quá 24 giờ chưa điền đủ thông tin. Hãy điền đủ trước khi thêm phiếu mới.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('tk_number'));
  delete from public.tk_reservations where expires_at <= now();

  update public.tk_reservations r set expires_at = now() + interval '5 minutes'
  where r.user_id = v_uid and r.tk_year = v_y and r.tk_month = v_m
    and not exists (select 1 from public.transport_plans t
                    where t.tk_year = r.tk_year and t.tk_month = r.tk_month and t.tk_seq = r.tk_seq)
  returning r.tk_seq into v_seq;
  if found then
    return public.tk_format(v_y, v_m, v_seq);
  end if;

  delete from public.tk_reservations where user_id = v_uid;
  v_seq := public.tk_next_seq(v_y, v_m);
  if v_seq is null then
    raise exception 'Đã hết số phiếu thống kê trong tháng %/%', v_m, v_y using errcode = 'P0001';
  end if;

  insert into public.tk_reservations (tk_year, tk_month, tk_seq, user_id, expires_at)
  values (v_y, v_m, v_seq, v_uid, now() + interval '5 minutes');
  return public.tk_format(v_y, v_m, v_seq);
end $$;
revoke execute on function public.reserve_tk_number() from public, anon;
grant execute on function public.reserve_tk_number() to authenticated;

-- ---------- 5. Nhắc: due_at = lúc bắt đầu bị khóa (tạo + 24h) ----------
drop function if exists public.my_incomplete_items();
create function public.my_incomplete_items()
returns table (item_kind text, id bigint, label text, created_at timestamptz, due_at timestamptz, missing text[])
language sql stable security definer set search_path = '' as $$
  select 'plan', p.id, p.tk_number, p.created_at, p.created_at + interval '24 hours', public.plan_missing(p)
    from public.transport_plans p
   where p.require_complete and p.created_by = (select auth.uid()) and (select public.is_active_user())
     and cardinality(public.plan_missing(p)) > 0
  union all
  select 'detail', d.id, coalesce(d.tk_number, '(chưa có số TK)') || coalesce(' · PXK ' || nullif(d.warehouse_slip_no, ''), ''),
         d.created_at, d.created_at + interval '24 hours', public.detail_missing(d)
    from public.inspection_details d
   where d.require_complete and d.created_by = (select auth.uid()) and (select public.is_active_user())
     and cardinality(public.detail_missing(d)) > 0
  order by 4
$$;
revoke all on function public.my_incomplete_items() from public, anon;
grant execute on function public.my_incomplete_items() to authenticated;

do $$
begin
  assert not exists (select 1 from pg_proc where proname = 'purge_incomplete'), 'purge_incomplete phải bị xóa';
  assert (select count(*) from pg_trigger where tgname in ('transport_plans_guard_blocked', 'inspection_details_guard_blocked')) = 2, 'thiếu trigger chặn';
end $$;

commit;
