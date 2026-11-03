-- T-078 / D-027: phiếu / dòng tạo trên web mà sau 24h vẫn thiếu thông tin (trừ Ghi chú) thì tự xóa.
--   Phiếu đủ: Ngày xuất, Số lệnh VC, Phân loại VC, Số xe, Tài xế/phụ xe, và NV xuất TP/BTP hoặc ít nhất 1 NV xuất VT.
--   Dòng đủ: Số phiếu TK, Số phiếu xuất kho, Công trình, Đơn vị giao, Đơn vị nhận, Loại hình xuất, Mặt hàng, ĐVT, Số lượng, Khối lượng
--            (Hạng mục, Nhà xe, NV xuất hàng, Ghi chú được trống).
--   Phiếu thiếu nhưng đã có dòng Bảng kiểm → KHÔNG xóa, chỉ nhắc người tạo điền (my_incomplete_items).
--   Chỉ áp cho bản ghi tạo sau migration này: cột require_complete (cũ = false, mới = true) → dữ liệu nạp từ Google Sheets / LOADTEST không bị đụng.
-- Chạy lại được. Cần extension pg_cron (Supabase: Database → Extensions; migration tự bật nếu được phép).
begin;

-- ---------- 1. Đánh dấu bản ghi mới ----------
alter table public.transport_plans add column if not exists require_complete boolean not null default false;
alter table public.transport_plans alter column require_complete set default true;
alter table public.inspection_details add column if not exists require_complete boolean not null default false;
alter table public.inspection_details alter column require_complete set default true;
comment on column public.transport_plans.require_complete is 'true = tạo trên web sau D-027: sau 24h còn thiếu thông tin (và chưa có dòng) thì tự xóa';
comment on column public.inspection_details.require_complete is 'true = tạo trên web sau D-027: sau 24h còn thiếu thông tin thì tự xóa';

create index if not exists transport_plans_require_complete_idx on public.transport_plans (created_at) where require_complete;
create index if not exists inspection_details_require_complete_idx on public.inspection_details (created_at) where require_complete;

-- ---------- 2. Danh sách ô còn thiếu (rỗng = đủ) ----------
create or replace function public.plan_missing(p public.transport_plans)
returns text[] language sql stable set search_path = '' as $$
  select array_remove(array[
    case when p.export_date is null then 'Ngày xuất' end,
    case when nullif(btrim(p.transport_order_no), '') is null then 'Số lệnh VC' end,
    case when p.transport_type_id is null then 'Phân loại VC' end,
    case when p.vehicle_id is null then 'Số xe' end,
    case when p.driver_id is null then 'Tài xế/ phụ xe' end,
    case when p.fg_exporter_id is null
          and not exists (select 1 from public.transport_plan_material_exporters m where m.plan_id = p.id)
         then 'NV xuất TP/BTP hoặc NV xuất VT' end
  ], null)
$$;

create or replace function public.detail_missing(d public.inspection_details)
returns text[] language sql immutable set search_path = '' as $$
  select array_remove(array[
    case when d.plan_id is null then 'Số phiếu TK' end,
    case when nullif(btrim(d.warehouse_slip_no), '') is null then 'Số phiếu xuất kho' end,
    case when d.construction_id is null then 'Công trình' end,
    case when d.delivery_unit_id is null then 'Đơn vị giao hàng' end,
    case when d.receiving_unit_id is null then 'Đơn vị nhận hàng' end,
    case when d.export_type_id is null then 'Loại hình xuất' end,
    case when d.product_id is null then 'Mặt hàng' end,
    case when d.unit_id is null then 'ĐVT' end,
    case when d.quantity is null then 'Số lượng' end,
    case when d.total_weight_kg is null then 'Khối lượng' end
  ], null)
$$;
revoke all on function public.plan_missing(public.transport_plans) from public, anon;
revoke all on function public.detail_missing(public.inspection_details) from public, anon;
grant execute on function public.plan_missing(public.transport_plans) to authenticated;
grant execute on function public.detail_missing(public.inspection_details) to authenticated;

-- ---------- 3. Xóa (chạy theo lịch) ----------
-- Xóa dòng trước, rồi phiếu không còn dòng nào. Trả số đã xóa để xem log cron.
create or replace function public.purge_incomplete()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare nd int; np int;
begin
  delete from public.inspection_details d
   where d.require_complete and d.created_at < now() - interval '24 hours'
     and cardinality(public.detail_missing(d)) > 0;
  get diagnostics nd = row_count;

  delete from public.transport_plans p
   where p.require_complete and p.created_at < now() - interval '24 hours'
     and cardinality(public.plan_missing(p)) > 0
     and not exists (select 1 from public.inspection_details d where d.plan_id = p.id);
  get diagnostics np = row_count;

  return jsonb_build_object('details', nd, 'plans', np);
end $$;
revoke all on function public.purge_incomplete() from public, anon, authenticated;

-- ---------- 4. Nhắc người tạo ----------
-- Phiếu/dòng của chính mình còn thiếu: delete_at = hạn xóa; null = không bị xóa (phiếu đã có dòng) nhưng cần điền.
create or replace function public.my_incomplete_items()
returns table (item_kind text, id bigint, label text, created_at timestamptz, delete_at timestamptz, missing text[])
language sql stable security definer set search_path = '' as $$
  select 'plan', p.id, p.tk_number, p.created_at,
         case when exists (select 1 from public.inspection_details d where d.plan_id = p.id) then null
              else p.created_at + interval '24 hours' end,
         public.plan_missing(p)
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

-- ---------- 5. Lịch: mỗi 15 phút ----------
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'purge-incomplete';
select cron.schedule('purge-incomplete', '*/15 * * * *', 'select public.purge_incomplete()');

-- ---------- Tự kiểm ----------
do $$
begin
  assert (select count(*) from cron.job where jobname = 'purge-incomplete') = 1, 'thiếu lịch purge-incomplete';
end $$;

commit;
