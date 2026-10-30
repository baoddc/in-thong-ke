-- T-023: tối ưu tìm kiếm ilike / lọc ngày cho ~22.000 phiếu và ~42.000 dòng + RPC tổng khối lượng.
-- Idempotent: chạy lại không lỗi. Đã có sẵn từ 000001/000003: inspection_details(created_at desc),
-- (export_date), (export_type_id), (product_id), transport_plans(created_at desc).
begin;

create extension if not exists pg_trgm with schema extensions;

-- ilike '%x%' dùng được GIN trigram
create index if not exists transport_plans_tk_number_trgm_idx
  on public.transport_plans using gin (tk_number extensions.gin_trgm_ops);
create index if not exists transport_plans_transport_order_no_trgm_idx
  on public.transport_plans using gin (transport_order_no extensions.gin_trgm_ops);
create index if not exists inspection_details_warehouse_slip_no_trgm_idx
  on public.inspection_details using gin (warehouse_slip_no extensions.gin_trgm_ops);
create index if not exists lookup_items_code_trgm_idx
  on public.lookup_items using gin (code extensions.gin_trgm_ops);
create index if not exists lookup_items_name_trgm_idx
  on public.lookup_items using gin (name extensions.gin_trgm_ops);

-- lọc/sắp theo ngày xuất của phiếu (chưa có)
create index if not exists transport_plans_export_date_idx on public.transport_plans (export_date);

-- Tổng khối lượng (kg) trong khoảng nửa mở [p_from, p_to); RLS áp theo người gọi.
create or replace function public.inspection_weight_total(p_from date, p_to date)
returns numeric
language sql stable security invoker set search_path = ''
as $$
  select coalesce(sum(total_weight_kg), 0)
  from public.inspection_details
  where export_date >= p_from and export_date < p_to
$$;

revoke all on function public.inspection_weight_total(date, date) from public, anon;
grant execute on function public.inspection_weight_total(date, date) to authenticated;

do $$
declare i text;
begin
  assert exists (select 1 from pg_extension where extname = 'pg_trgm'), 'thiếu extension pg_trgm';
  foreach i in array array[
    'transport_plans_tk_number_trgm_idx', 'transport_plans_transport_order_no_trgm_idx',
    'inspection_details_warehouse_slip_no_trgm_idx', 'lookup_items_code_trgm_idx',
    'lookup_items_name_trgm_idx', 'transport_plans_export_date_idx',
    'inspection_details_export_date_idx', 'inspection_details_created_at_idx',
    'inspection_details_export_type_id_idx', 'inspection_details_product_id_idx'
  ] loop
    assert exists (select 1 from pg_indexes where schemaname = 'public' and indexname = i), 'thiếu index ' || i;
  end loop;
  assert to_regprocedure('public.inspection_weight_total(date,date)') is not null, 'thiếu hàm inspection_weight_total';
  assert not has_function_privilege('anon', 'public.inspection_weight_total(date,date)', 'execute'), 'anon không được gọi';
  assert has_function_privilege('authenticated', 'public.inspection_weight_total(date,date)', 'execute'), 'authenticated phải gọi được';
end $$;

commit;
