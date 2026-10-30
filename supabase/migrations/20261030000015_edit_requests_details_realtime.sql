-- T-049 / D-020: yêu cầu sửa cho TỪNG DÒNG bảng kiểm + bật Realtime cho edit_requests.
-- Phụ thuộc 000014 (edit_requests, can_update_row 3 tham số, request_plan_edit, decide_edit_request), 000009/000010.
-- Không sửa migration cũ; dán vào SQL Editor chạy lại được (if not exists / or replace / drop if exists), không dùng bảng tạm.
begin;

-- ---------- 1. edit_requests: plan_id HOẶC detail_id (đúng một) ----------
alter table public.edit_requests alter column plan_id drop not null;
alter table public.edit_requests add column if not exists detail_id bigint null
  constraint edit_requests_detail_id_fkey references public.inspection_details (id) on delete cascade;

alter table public.edit_requests drop constraint if exists edit_requests_target_check;
alter table public.edit_requests add constraint edit_requests_target_check check (num_nonnulls(plan_id, detail_id) = 1);

-- mỗi người chỉ một yêu cầu đang chờ cho mỗi dòng
create unique index if not exists edit_requests_pending_detail_uq on public.edit_requests (detail_id, requested_by)
  where status = 'pending' and detail_id is not null;
create index if not exists edit_requests_detail_idx on public.edit_requests (detail_id) where detail_id is not null;  -- khóa ngoại (xóa dòng cascade)

-- ---------- 2. can_update_row thêm tham số p_detail_id ----------
-- Thứ tự: bỏ policy phụ thuộc -> bỏ bản 3 tham số (tránh 2 overload gây mơ hồ) -> tạo bản 4 tham số -> tạo lại can_edit_plan + policy.
drop policy if exists transport_plans_update on public.transport_plans;
drop policy if exists inspection_details_update on public.inspection_details;
drop function if exists public.can_update_row(uuid, timestamptz, bigint);

-- Mở khóa theo phiếu (p_plan_id, như 000014) HOẶC theo dòng (p_detail_id): yêu cầu approved còn hạn của chính người tạo.
create or replace function public.can_update_row(p_created_by uuid, p_created_at timestamptz, p_plan_id bigint, p_detail_id bigint default null)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.can_edit_row(p_created_by, p_created_at)
      or coalesce(public.is_active_user()
                  and p_created_by = (select auth.uid())
                  and exists (select 1 from public.edit_requests r
                              where r.requested_by = (select auth.uid())
                                and r.status = 'approved' and r.unlock_until > now()
                                and ((p_plan_id is not null and r.plan_id = p_plan_id)
                                     or (p_detail_id is not null and r.detail_id = p_detail_id))), false)
$$;

-- can_edit_plan (bảng nối NV xuất VT): p_detail_id null -> chỉ xét mở khóa theo phiếu như cũ.
create or replace function public.can_edit_plan(p_plan_id bigint)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.transport_plans p
                 where p.id = p_plan_id and public.can_update_row(p.created_by, p.created_at, p.id, null))
$$;

revoke all on function public.can_update_row(uuid, timestamptz, bigint, bigint), public.can_edit_plan(bigint) from public, anon;
grant execute on function public.can_update_row(uuid, timestamptz, bigint, bigint), public.can_edit_plan(bigint) to authenticated;

create policy transport_plans_update on public.transport_plans for update to authenticated
  using (public.can_update_row(created_by, created_at, id, null))
  with check (public.can_update_row(created_by, created_at, id, null));

-- with check dùng plan_id MỚI (như 000014) và id của dòng (không đổi được): không lách bằng cách chuyển dòng sang phiếu khác.
create policy inspection_details_update on public.inspection_details for update to authenticated
  using (public.can_update_row(created_by, created_at, plan_id, id))
  with check (public.can_update_row(created_by, created_at, plan_id, id));

-- ---------- 3. RPC request_detail_edit ----------
create or replace function public.request_detail_edit(p_detail_id bigint, p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  v_created_by uuid;
  v_created_at timestamptz;
  v_plan_id bigint;
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

  select d.created_by, d.created_at, d.plan_id into v_created_by, v_created_at, v_plan_id
  from public.inspection_details d where d.id = p_detail_id;
  if not found or v_created_by is distinct from v_uid then
    raise exception 'Không tìm thấy dòng hoặc bạn không phải người tạo dòng' using errcode = 'P0002';
  end if;
  if v_created_at > now() - interval '24 hours' then
    raise exception 'Dòng còn trong 24 giờ, sửa trực tiếp' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.edit_requests r
             where r.requested_by = v_uid and r.status = 'approved' and r.unlock_until > now()
               and (r.detail_id = p_detail_id or (v_plan_id is not null and r.plan_id = v_plan_id))) then
    raise exception 'Dòng đang được mở khóa sửa, không cần gửi yêu cầu' using errcode = 'P0001';
  end if;

  begin
    insert into public.edit_requests (detail_id, requested_by, reason) values (p_detail_id, v_uid, v_reason)
    returning id into v_id;
  exception when unique_violation then  -- chống gửi đồng thời hai lần
    raise exception 'Đã có yêu cầu đang chờ duyệt' using errcode = 'P0001';
  end;
  return v_id;
end $$;

revoke execute on function public.request_detail_edit(bigint, text) from public, anon;
grant execute on function public.request_detail_edit(bigint, text) to authenticated;

-- decide_edit_request (000014) không đổi: chỉ đọc/ghi theo id yêu cầu nên dùng được cho cả yêu cầu phiếu và dòng.

-- ---------- 4. Realtime ----------
-- Không cần replica identity full: payload `new` của UPDATE luôn đủ cột; bộ lọc `requested_by=eq.<uid>` xét trên bản ghi mới.
-- (Chỉ payload `old` thiếu cột ngoài khóa chính; FE không dùng old.) RLS select của edit_requests tự áp cho Realtime.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'edit_requests') then
    alter publication supabase_realtime add table public.edit_requests;
  end if;
end $$;

-- ---------- 5. Kiểm tra ----------
do $$
begin
  assert exists (select 1 from pg_constraint where conrelid = 'public.edit_requests'::regclass and conname = 'edit_requests_target_check'),
    'thiếu check edit_requests_target_check';
  assert exists (select 1 from pg_constraint where conrelid = 'public.edit_requests'::regclass and conname = 'edit_requests_detail_id_fkey'),
    'thiếu FK edit_requests_detail_id_fkey';
  assert exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'edit_requests_pending_detail_uq'),
    'thiếu unique edit_requests_pending_detail_uq';

  assert exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inspection_details' and cmd = 'UPDATE'
                   and qual like '%can_update_row%' and qual like '%plan_id, id)%'
                   and with_check like '%can_update_row%' and with_check like '%plan_id, id)%'),
    'policy update inspection_details phải dùng can_update_row(..., plan_id, id)';
  assert exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'transport_plans' and cmd = 'UPDATE'
                   and qual like '%can_update_row%' and with_check like '%can_update_row%'),
    'policy update transport_plans phải dùng can_update_row';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename in ('transport_plans', 'inspection_details')) = 8,
    'transport_plans/inspection_details: phải có 8 policy';
  assert pg_get_functiondef('public.can_edit_plan(bigint)'::regprocedure) like '%can_update_row%', 'can_edit_plan phải dùng can_update_row';

  -- chỉ còn một overload can_update_row (4 tham số)
  assert (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'can_update_row') = 1
     and to_regprocedure('public.can_update_row(uuid,timestamptz,bigint,bigint)') is not null,
    'can_update_row phải còn đúng một overload 4 tham số';
  assert has_function_privilege('authenticated', 'public.can_update_row(uuid,timestamptz,bigint,bigint)', 'execute')
     and not has_function_privilege('anon', 'public.can_update_row(uuid,timestamptz,bigint,bigint)', 'execute'),
    'quyền execute can_update_row sai';

  assert to_regprocedure('public.request_detail_edit(bigint,text)') is not null, 'thiếu request_detail_edit';
  assert (select prosecdef from pg_proc where oid = 'public.request_detail_edit(bigint,text)'::regprocedure), 'request_detail_edit phải security definer';
  assert has_function_privilege('authenticated', 'public.request_detail_edit(bigint,text)', 'execute'), 'authenticated phải gọi được request_detail_edit';
  assert not has_function_privilege('anon', 'public.request_detail_edit(bigint,text)', 'execute'), 'anon không được gọi request_detail_edit';

  assert exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'edit_requests'),
    'edit_requests chưa nằm trong publication supabase_realtime';

  -- không có người dùng (auth.uid() null) thì không được mở khóa
  assert not public.can_update_row(null, now() - interval '48 hours', 1, 1), 'can_update_row phải false khi không có người dùng';
end $$;

commit;
