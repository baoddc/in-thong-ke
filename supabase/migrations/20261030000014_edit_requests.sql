-- T-047 / D-019: yêu cầu sửa phiếu quá 24 giờ. Phụ thuộc 000009 (can_edit_row, policy), 000010 (is_admin gồm root), 000001 (set_updated_at).
-- Không sửa migration cũ; dán vào SQL Editor chạy lại được (if not exists / or replace / drop if exists).
-- Người tạo gửi yêu cầu -> admin/root duyệt -> người tạo được SỬA (không xóa) phiếu + dòng bảng kiểm do chính họ tạo thuộc phiếu đó
-- trong 24 giờ kể từ lúc duyệt (unlock_until). Kiểm quyền ở RLS policy update qua can_update_row().
begin;

-- ---------- 1. Bảng edit_requests ----------
create table if not exists public.edit_requests (
  id bigint generated always as identity primary key,
  plan_id bigint not null constraint edit_requests_plan_id_fkey references public.transport_plans (id) on delete cascade,
  requested_by uuid not null constraint edit_requests_requested_by_fkey references public.profiles (id),
  reason text not null constraint edit_requests_reason_check check (char_length(btrim(reason)) between 1 and 500),
  status text not null default 'pending' constraint edit_requests_status_check check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid null constraint edit_requests_decided_by_fkey references public.profiles (id),
  decided_at timestamptz null,
  decision_note text null,
  unlock_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- mỗi người chỉ một yêu cầu đang chờ cho mỗi phiếu
create unique index if not exists edit_requests_pending_uq on public.edit_requests (plan_id, requested_by) where status = 'pending';
create index if not exists edit_requests_status_created_idx on public.edit_requests (status, created_at desc);
create index if not exists edit_requests_requested_plan_idx on public.edit_requests (requested_by, plan_id);
create index if not exists edit_requests_plan_idx on public.edit_requests (plan_id);  -- khóa ngoại (xóa phiếu cascade)
create index if not exists edit_requests_decided_by_idx on public.edit_requests (decided_by) where decided_by is not null;

drop trigger if exists edit_requests_set_updated_at on public.edit_requests;
create trigger edit_requests_set_updated_at before update on public.edit_requests
  for each row execute function public.set_updated_at();

alter table public.edit_requests enable row level security;
revoke all on public.edit_requests from anon, authenticated;
grant select on public.edit_requests to authenticated;

-- Chỉ đọc: yêu cầu của mình, hoặc admin/root đọc tất cả. Không có policy insert/update/delete: ghi chỉ qua RPC security definer.
drop policy if exists edit_requests_select on public.edit_requests;
create policy edit_requests_select on public.edit_requests for select to authenticated
  using (requested_by = (select auth.uid()) or (select public.is_admin()));

-- ---------- 2. can_update_row: can_edit_row + mở khóa đã duyệt ----------
-- Cho dòng của phiếu p_plan_id: người tạo dòng (p_created_by) có yêu cầu approved còn hạn của chính mình cho phiếu đó.
-- Chỉ dùng cho UPDATE; DELETE vẫn can_edit_row.
create or replace function public.can_update_row(p_created_by uuid, p_created_at timestamptz, p_plan_id bigint)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.can_edit_row(p_created_by, p_created_at)
      or coalesce(public.is_active_user()
                  and p_created_by = (select auth.uid())
                  and p_plan_id is not null
                  and exists (select 1 from public.edit_requests r
                              where r.requested_by = (select auth.uid()) and r.plan_id = p_plan_id
                                and r.status = 'approved' and r.unlock_until > now()), false)
$$;

-- can_edit_plan (bảng nối NV xuất VT): cùng quy tắc sửa như phiếu cha, kể cả khi được mở khóa.
create or replace function public.can_edit_plan(p_plan_id bigint)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.transport_plans p
                 where p.id = p_plan_id and public.can_update_row(p.created_by, p.created_at, p.id))
$$;

revoke all on function public.can_update_row(uuid, timestamptz, bigint), public.can_edit_plan(bigint) from public, anon;
grant execute on function public.can_update_row(uuid, timestamptz, bigint), public.can_edit_plan(bigint) to authenticated;

-- ---------- 3. Policy UPDATE dùng can_update_row (DELETE giữ can_edit_row) ----------
-- inspection_details.with check dùng plan_id MỚI: chuyển dòng sang phiếu khác chỉ được khi phiếu đó cũng đang mở khóa
-- (hoặc dòng còn trong 24 giờ như trước) -> không lách được; chuyển về plan_id null chỉ khi còn trong 24 giờ/admin.
drop policy if exists transport_plans_update on public.transport_plans;
create policy transport_plans_update on public.transport_plans for update to authenticated
  using (public.can_update_row(created_by, created_at, id))
  with check (public.can_update_row(created_by, created_at, id));

drop policy if exists inspection_details_update on public.inspection_details;
create policy inspection_details_update on public.inspection_details for update to authenticated
  using (public.can_update_row(created_by, created_at, plan_id))
  with check (public.can_update_row(created_by, created_at, plan_id));

-- update_transport_plan (000009) là security invoker, tự theo policy update của transport_plans và tpme (can_edit_plan)
-- nên không cần sửa; riêng thông báo lỗi nhắc thêm đường "Yêu cầu sửa".
create or replace function public.update_transport_plan(
  p_id bigint, p_export_date date, p_transport_order_no text, p_transport_type_id bigint, p_vehicle_id bigint,
  p_driver_id bigint, p_fg_exporter_id bigint, p_material_exporter_ids bigint[], p_note text)
returns public.transport_plans language plpgsql set search_path = '' as $$
declare
  v_row public.transport_plans;
begin
  update public.transport_plans set
    export_date = p_export_date,
    transport_order_no = nullif(btrim(p_transport_order_no), ''),
    transport_type_id = p_transport_type_id,
    vehicle_id = p_vehicle_id,
    driver_id = p_driver_id,
    fg_exporter_id = p_fg_exporter_id,
    note = nullif(btrim(p_note), '')
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Không tìm thấy phiếu hoặc bạn không có quyền sửa (chỉ người tạo trong 24 giờ, người được duyệt yêu cầu sửa, hoặc admin)' using errcode = 'P0002';
  end if;

  delete from public.transport_plan_material_exporters where plan_id = p_id;
  insert into public.transport_plan_material_exporters (plan_id, lookup_id, sort_order)
  select p_id, s.x, (row_number() over (order by s.o) - 1)::int
  from (select t.x, min(t.o) as o
        from unnest(coalesce(p_material_exporter_ids, '{}')) with ordinality as t(x, o)
        where t.x is not null group by t.x) s;

  return v_row;
end $$;

revoke execute on function public.update_transport_plan(bigint,date,text,bigint,bigint,bigint,bigint,bigint[],text) from public, anon;
grant execute on function public.update_transport_plan(bigint,date,text,bigint,bigint,bigint,bigint,bigint[],text) to authenticated;

-- ---------- 4. RPC request_plan_edit ----------
create or replace function public.request_plan_edit(p_plan_id bigint, p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  v_created_by uuid;
  v_created_at timestamptz;
  v_id bigint;
begin
  if not public.is_active_user() then
    raise exception 'Bạn không có quyền gửi yêu cầu sửa' using errcode = '42501';
  end if;
  if v_reason = '' then
    raise exception 'Vui lòng nhập lý do yêu cầu sửa' using errcode = '22023';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Lý do tối đa 500 ký tự' using errcode = '22023';
  end if;

  select p.created_by, p.created_at into v_created_by, v_created_at from public.transport_plans p where p.id = p_plan_id;
  if not found or v_created_by is distinct from v_uid then
    raise exception 'Không tìm thấy phiếu hoặc bạn không phải người tạo phiếu' using errcode = 'P0002';
  end if;
  if v_created_at > now() - interval '24 hours' then
    raise exception 'Phiếu còn trong 24 giờ, sửa trực tiếp' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.edit_requests r
             where r.plan_id = p_plan_id and r.requested_by = v_uid and r.status = 'approved' and r.unlock_until > now()) then
    raise exception 'Phiếu đang được mở khóa sửa, không cần gửi yêu cầu' using errcode = 'P0001';
  end if;

  begin
    insert into public.edit_requests (plan_id, requested_by, reason) values (p_plan_id, v_uid, v_reason)
    returning id into v_id;
  exception when unique_violation then  -- chống gửi đồng thời hai lần
    raise exception 'Đã có yêu cầu đang chờ duyệt' using errcode = 'P0001';
  end;
  return v_id;
end $$;

-- ---------- 5. RPC decide_edit_request ----------
create or replace function public.decide_edit_request(p_id bigint, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'Chỉ admin được duyệt yêu cầu sửa' using errcode = '42501';
  end if;
  if p_approve is null then
    raise exception 'Thiếu quyết định duyệt hay từ chối' using errcode = '22023';
  end if;

  select r.status into v_status from public.edit_requests r where r.id = p_id for update;
  if not found then
    raise exception 'Không tìm thấy yêu cầu sửa' using errcode = 'P0002';
  end if;
  if v_status <> 'pending' then
    raise exception 'Yêu cầu này đã được xử lý' using errcode = 'P0001';
  end if;

  update public.edit_requests set
    status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = (select auth.uid()),
    decided_at = now(),
    decision_note = nullif(btrim(p_note), ''),
    unlock_until = case when p_approve then now() + interval '24 hours' else null end
  where id = p_id;
end $$;

revoke execute on function public.request_plan_edit(bigint, text), public.decide_edit_request(bigint, boolean, text) from public, anon;
grant execute on function public.request_plan_edit(bigint, text), public.decide_edit_request(bigint, boolean, text) to authenticated;

-- ---------- 6. Kiểm tra ----------
do $$
declare f text;
begin
  assert exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = 'edit_requests' and c.relrowsecurity), 'edit_requests chưa bật RLS';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'edit_requests') = 1
     and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'edit_requests' and cmd = 'SELECT'),
    'edit_requests: chỉ được có đúng 1 policy select (không insert/update/delete)';
  assert not has_table_privilege('anon', 'public.edit_requests', 'select'), 'anon không được đọc edit_requests';
  assert not has_table_privilege('authenticated', 'public.edit_requests', 'insert')
     and not has_table_privilege('authenticated', 'public.edit_requests', 'update')
     and not has_table_privilege('authenticated', 'public.edit_requests', 'delete'), 'authenticated không được ghi edit_requests';
  assert (select count(*) from pg_constraint where conname in ('edit_requests_requested_by_fkey', 'edit_requests_decided_by_fkey')
          and conrelid = 'public.edit_requests'::regclass) = 2, 'thiếu FK edit_requests -> profiles';

  -- update dùng can_update_row, delete vẫn can_edit_row
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename in ('transport_plans', 'inspection_details')
            and cmd = 'UPDATE' and coalesce(qual, '') like '%can_update_row%' and coalesce(with_check, '') like '%can_update_row%') = 2,
    'policy update phải dùng can_update_row (using + with check)';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename in ('transport_plans', 'inspection_details')
            and cmd = 'DELETE' and coalesce(qual, '') like '%can_edit_row%') = 2, 'policy delete phải giữ can_edit_row';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename in ('transport_plans', 'inspection_details')) = 8,
    'transport_plans/inspection_details: phải có 8 policy';
  assert pg_get_functiondef('public.can_edit_plan(bigint)'::regprocedure) like '%can_update_row%', 'can_edit_plan phải dùng can_update_row';

  foreach f in array array['public.can_update_row(uuid,timestamptz,bigint)', 'public.request_plan_edit(bigint,text)',
                           'public.decide_edit_request(bigint,boolean,text)'] loop
    assert to_regprocedure(f) is not null, 'thiếu hàm ' || f;
    assert (select prosecdef from pg_proc where oid = f::regprocedure), f || ' phải security definer';
    assert has_function_privilege('authenticated', f, 'execute'), 'authenticated phải gọi được ' || f;
    assert not has_function_privilege('anon', f, 'execute'), 'anon không được gọi ' || f;
  end loop;
  -- không có người dùng (auth.uid() null) thì không được mở khóa
  assert not public.can_update_row(null, now() - interval '48 hours', 1), 'can_update_row phải false khi không có người dùng';
end $$;

commit;
