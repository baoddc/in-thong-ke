-- T-039 / D-015, D-016: tự đăng ký chờ duyệt; người duyệt/người tạo tài khoản; người sửa lần cuối. Chạy lại được (idempotent). Phụ thuộc 000009, 000010.
-- Tài khoản chờ duyệt có is_active=false nên is_active_user()/RLS đã chặn; không đổi hàm/policy của profiles.
begin;

-- ---------- 1. profiles: chờ duyệt + dấu vết duyệt/tạo ----------
alter table public.profiles add column if not exists is_pending boolean not null default false;
alter table public.profiles add column if not exists created_by uuid null references auth.users (id) on delete set null;
alter table public.profiles add column if not exists approved_by uuid null references auth.users (id) on delete set null;
alter table public.profiles add column if not exists approved_at timestamptz null;

-- Đang chờ duyệt thì phải đang bị khóa (is_active=false)
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_pending_inactive_chk') then
    alter table public.profiles add constraint profiles_pending_inactive_chk check (not is_pending or not is_active);
  end if;
end $$;

-- Backfill: tài khoản hiện có coi như đã duyệt lúc tạo (approved_by null = không rõ người duyệt)
update public.profiles set approved_at = created_at where approved_at is null and not is_pending;

-- Đếm nhanh số yêu cầu chờ duyệt (chống spam trong Edge Function register) + index khóa ngoại
create index if not exists profiles_pending_idx on public.profiles (created_at) where is_pending;
create index if not exists profiles_created_by_idx on public.profiles (created_by) where created_by is not null;
create index if not exists profiles_approved_by_idx on public.profiles (approved_by) where approved_by is not null;

-- ---------- 2. Người sửa lần cuối của phiếu & dòng bảng kiểm ----------
alter table public.transport_plans add column if not exists updated_by uuid null references auth.users (id) on delete set null;
alter table public.inspection_details add column if not exists updated_by uuid null references auth.users (id) on delete set null;
create index if not exists transport_plans_updated_by_idx on public.transport_plans (updated_by) where updated_by is not null;
create index if not exists inspection_details_updated_by_idx on public.inspection_details (updated_by) where updated_by is not null;

-- Giữ hành vi 000009 (created_by/created_at do DB đặt); thêm updated_by.
-- auth.uid() null (SQL Editor / service role): không động updated_by, nên cập nhật hàng loạt dữ liệu cũ không đổi người sửa.
create or replace function public.guard_owner_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    if tg_op = 'INSERT' then
      new.created_by := (select auth.uid());
      new.created_at := now();
      new.updated_by := null; -- chưa có sửa
    else
      new.created_by := old.created_by;
      new.created_at := old.created_at;
      new.updated_by := (select auth.uid());
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_owner_fields() from public, anon, authenticated;

-- View: y nguyên 000009, thêm updated_by ở CUỐI (sau created_by)
create or replace view public.inspection_details_view with (security_invoker = true) as
select
  d.id,
  d.plan_id,
  d.tk_number,
  p.transport_order_no,
  d.export_date,
  d.warehouse_slip_no,
  d.construction_id,
  con.code as construction_code,
  con.name as construction_name,
  d.work_item,
  d.delivery_unit_id,
  du.name as delivery_unit_name,
  d.receiving_unit_id,
  ru.name as receiving_unit_name,
  d.export_type_id,
  et.name as export_type_name,
  d.product_id,
  pr.name as product_name,
  d.unit_id,
  un.name as unit_name,
  d.quantity,
  d.total_weight_kg,
  coalesce(sh.name, fg.name, mx.name) as shipper_name,  -- người được chọn cho dòng; trống thì theo phiếu (TP/BTP, rồi NV xuất VT đầu tiên)
  veh.name as vehicle_name,
  drv.name as driver_name,
  d.carrier_id,
  ca.name as carrier_name,
  d.note,
  d.created_at,
  d.updated_at,
  d.shipper_id,
  coalesce(fg.name, mx.name) as plan_shipper_name,
  d.created_by,
  d.updated_by
from public.inspection_details d
left join public.transport_plans p on p.id = d.plan_id
left join public.lookup_items con on con.id = d.construction_id
left join public.lookup_items du on du.id = d.delivery_unit_id
left join public.lookup_items ru on ru.id = d.receiving_unit_id
left join public.lookup_items et on et.id = d.export_type_id
left join public.lookup_items pr on pr.id = d.product_id
left join public.lookup_items un on un.id = d.unit_id
left join public.lookup_items ca on ca.id = d.carrier_id
left join public.lookup_items sh on sh.id = d.shipper_id
left join public.lookup_items fg on fg.id = p.fg_exporter_id
left join public.lookup_items veh on veh.id = p.vehicle_id
left join public.lookup_items drv on drv.id = p.driver_id
left join lateral (
  select l.name
  from public.transport_plan_material_exporters m
  join public.lookup_items l on l.id = m.lookup_id
  where m.plan_id = d.plan_id
  order by m.sort_order, m.lookup_id
  limit 1
) mx on true;

revoke all on public.inspection_details_view from anon;
grant select on public.inspection_details_view to authenticated;

-- ---------- 3. RPC tên người dùng (RLS profiles không cho user thường đọc hồ sơ người khác) ----------
-- Chỉ trả id + họ tên + tên đăng nhập, chỉ cho người đang hoạt động; tối đa 500 id (phần dư bị bỏ).
create or replace function public.get_user_names(p_ids uuid[])
returns table (id uuid, full_name text, username text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name, p.username
  from public.profiles p
  where (select public.is_active_user()) and p.id = any (p_ids[1:500])
$$;

revoke all on function public.get_user_names(uuid[]) from public, anon;
grant execute on function public.get_user_names(uuid[]) to authenticated;

-- ---------- 4. Kiểm tra ----------
do $$
begin
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
                 and column_name = 'is_pending' and data_type = 'boolean' and is_nullable = 'NO'), 'thiếu profiles.is_pending';
  assert (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
          and column_name in ('created_by', 'approved_by', 'approved_at')) = 3, 'thiếu cột created_by/approved_by/approved_at';
  assert (select count(*) from information_schema.columns where table_schema = 'public' and table_name in ('transport_plans', 'inspection_details')
          and column_name = 'updated_by') = 2, 'thiếu updated_by';
  assert (select count(*) from pg_indexes where schemaname = 'public'
          and indexname in ('profiles_pending_idx', 'profiles_created_by_idx', 'profiles_approved_by_idx',
                            'transport_plans_updated_by_idx', 'inspection_details_updated_by_idx')) = 5, 'thiếu index';
  assert not exists (select 1 from public.profiles where is_pending and is_active), 'có profile vừa pending vừa active';
  assert not exists (select 1 from public.profiles where not is_pending and approved_at is null), 'backfill approved_at chưa đủ';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'profiles') = 1, 'profiles: phải có đúng 1 policy';
  assert (select column_name from information_schema.columns where table_schema = 'public' and table_name = 'inspection_details_view'
          order by ordinal_position desc limit 1) = 'updated_by', 'view: updated_by phải là cột cuối';
  assert pg_get_functiondef('public.guard_owner_fields()'::regprocedure) ilike '%updated_by%', 'guard_owner_fields chưa đặt updated_by';
  assert to_regprocedure('public.get_user_names(uuid[])') is not null, 'thiếu get_user_names';
  assert has_function_privilege('authenticated', 'public.get_user_names(uuid[])', 'execute')
     and not has_function_privilege('anon', 'public.get_user_names(uuid[])', 'execute'), 'quyền gọi get_user_names sai';
  perform 1 from public.inspection_details_view limit 1;
end $$;

commit;
