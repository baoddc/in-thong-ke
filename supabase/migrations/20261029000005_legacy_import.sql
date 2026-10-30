-- T-021 / D-011: chuẩn bị nạp dữ liệu cũ (phiếu TK + bảng kiểm).
-- Viết để chạy lại được khi dán vào SQL Editor: if not exists / or replace / drop if exists.
begin;

-- ---------- 1. Dòng bảng kiểm cũ có thể không có số TK ----------
alter table public.inspection_details alter column plan_id drop not null;

-- View: giống 000004, chỉ đổi join -> left join transport_plans (cột và thứ tự giữ nguyên)
create or replace view public.inspection_details_view with (security_invoker = true) as
select
  d.id,
  d.plan_id,
  p.tk_number,
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
  coalesce(fg.name, mx.name) as plan_shipper_name
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

-- ---------- 2. tk_seq tới 9999 (số TK kiểu cũ). tk_next_seq vẫn chỉ cấp 1..999 cho số mới ----------
alter table public.transport_plans drop constraint if exists transport_plans_tk_seq_check;
alter table public.transport_plans add constraint transport_plans_tk_seq_check
  check (tk_seq between 1 and 9999);

-- ---------- 3. Khóa nạp lại không trùng ----------
alter table public.inspection_details add column if not exists import_ref text;
create unique index if not exists inspection_details_import_ref_uq
  on public.inspection_details (import_ref) where import_ref is not null;

-- ---------- 4. Bảng tạm cho import CSV qua Dashboard (toàn bộ text; cột đúng tên/thứ tự CSV) ----------
create table if not exists public.import_plans (
  tk_number text,
  tk_year text,
  tk_month text,
  tk_seq text,
  export_date text,
  transport_order_no text,
  transport_type text,
  vehicle text,
  driver text,
  fg_exporter text,
  material_exporter text,
  note text,
  is_stub text,
  source_row text
);

create table if not exists public.import_details (
  import_ref text,
  tk_number text,
  export_date text,
  warehouse_slip_no text,
  construction_code text,
  work_item text,
  delivery_unit text,
  receiving_unit text,
  export_type text,
  product text,
  unit text,
  quantity text,
  total_weight_kg text,
  shipper text,
  carrier text,
  note text,
  source_row text
);

comment on table public.import_plans is 'Bảng tạm nạp dữ liệu cũ (D-011). Xóa sau khi nạp xong: drop table public.import_plans;';
comment on table public.import_details is 'Bảng tạm nạp dữ liệu cũ (D-011). Xóa sau khi nạp xong: drop table public.import_details;';

-- RLS bật, không policy, không quyền cho anon/authenticated: chỉ postgres/Dashboard dùng
alter table public.import_plans enable row level security;
alter table public.import_details enable row level security;
revoke all on public.import_plans, public.import_details from anon, authenticated;

-- ---------- 5. Kiểm tra cấu trúc ----------
do $$
begin
  assert (select is_nullable from information_schema.columns
          where table_schema = 'public' and table_name = 'inspection_details' and column_name = 'plan_id') = 'YES',
    'inspection_details.plan_id còn not null';
  assert exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'inspection_details' and column_name = 'import_ref'), 'thiếu import_ref';
  assert exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'inspection_details_import_ref_uq'), 'thiếu index import_ref';
  assert (select pg_get_constraintdef(oid) from pg_constraint
          where conrelid = 'public.transport_plans'::regclass and conname = 'transport_plans_tk_seq_check') like '%9999%',
    'tk_seq chưa nới tới 9999';
  assert pg_get_viewdef('public.inspection_details_view'::regclass) ilike '%left join%transport_plans p on%', 'view chưa left join transport_plans';
  assert (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'inspection_details_view') = 32, 'view: số cột thay đổi';
  assert (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'import_plans') = 14, 'import_plans: số cột';
  assert (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'import_details') = 17, 'import_details: số cột';
  assert (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname in ('import_plans', 'import_details') and c.relrowsecurity) = 2, 'bảng tạm chưa bật RLS';
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('import_plans', 'import_details')), 'bảng tạm không được có policy';
  assert not has_table_privilege('anon', 'public.import_plans', 'select')
     and not has_table_privilege('authenticated', 'public.import_plans', 'select')
     and not has_table_privilege('anon', 'public.import_details', 'select')
     and not has_table_privilege('authenticated', 'public.import_details', 'select'), 'bảng tạm còn quyền cho anon/authenticated';
  perform 1 from public.inspection_details_view limit 1;
end $$;

commit;
