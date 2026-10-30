-- T-018 / D-009, D-010: NV xuất hàng chọn riêng theo dòng bảng kiểm; ghi lại unique index công trình đã sửa tay trên DB thật.
-- Viết để chạy lại được khi dán vào SQL Editor (mỗi câu có thể commit riêng): if not exists / or replace / drop if exists.
begin;

-- ---------- 1. D-009: unique (kind, lower(name)) không áp cho công trình (mã là khóa) ----------
create unique index if not exists lookup_items_kind_name_uq2
  on public.lookup_items (kind, lower(name)) where kind <> 'construction';
drop index if exists public.lookup_items_kind_name_uq;
alter index public.lookup_items_kind_name_uq2 rename to lookup_items_kind_name_uq;

-- ---------- 2. inspection_details.shipper_id (null = theo phiếu TK) ----------
alter table public.inspection_details add column if not exists shipper_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inspection_details_shipper_id_fkey') then
    alter table public.inspection_details
      add constraint inspection_details_shipper_id_fkey
      foreign key (shipper_id) references public.lookup_items(id) on delete restrict;
  end if;
end $$;

create index if not exists inspection_details_shipper_id_idx on public.inspection_details (shipper_id);

-- ---------- 3. View: thêm shipper_id, plan_shipper_name (cuối view); shipper_name ưu tiên người được chọn ----------
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
join public.transport_plans p on p.id = d.plan_id
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

-- ---------- 4. Kiểm tra cấu trúc ----------
do $$
begin
  assert exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'inspection_details' and column_name = 'shipper_id'), 'thiếu inspection_details.shipper_id';
  assert exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'inspection_details_view' and column_name = 'shipper_id'), 'view thiếu shipper_id';
  assert exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'inspection_details_view' and column_name = 'plan_shipper_name'), 'view thiếu plan_shipper_name';
  assert exists (select 1 from pg_indexes
                 where schemaname = 'public' and indexname = 'lookup_items_kind_name_uq'
                   and indexdef like '%construction%'), 'lookup_items_kind_name_uq thiếu điều kiện kind <> construction';
end $$;

commit;
