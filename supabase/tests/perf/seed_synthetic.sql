-- ============================================================================================
-- CẢNH BÁO: CHỈ CHẠY TRÊN DB THỬ / BRANCH (đã áp đủ migration 000001-000007). KHÔNG CHẠY TRÊN DB THẬT.
-- Script sinh dữ liệu giả (tiền tố 'SYN ...', số phiếu 'TKS...', import_ref 'synthetic-...') để đo tải.
-- Chốt an toàn: mọi hàm từ chối chạy nếu thấy dữ liệu KHÔNG phải giả trong inspection_details/transport_plans
--   (DB thật luôn dính). Branch có sẵn dữ liệu thật mà vẫn muốn chạy: gõ trước `set perf.allow_existing = 'yes';`
--   cùng phiên (SQL Editor: cùng một lần Run).
--
-- Cách dùng (SQL Editor, mỗi dòng "select" là một lần Run; mỗi lô 100.000 dòng, vài giây - vài chục giây):
--   1) Dán PHẦN A (tạo schema perf_synth + hàm) - chạy một lần.
--   2) Phiếu: chạy 5 lần `select perf_synth.add_plans(100000);`            -> 500.000 phiếu
--   3) Dòng : chạy 10 lần `select perf_synth.add_details(100000);`         -> 1.000.000 dòng (lặp thêm để tăng N)
--   4) Chạy PHẦN B (analyze).
--   5) Chạy từng câu PHẦN C (explain) và đối chiếu ngưỡng ghi cạnh mỗi câu.
--   6) Dọn: PHẦN D, hoặc bỏ cả branch.
-- Số liệu giả ghi qua trigger thật, nên bảng inspection_daily_stats cũng được dựng (kiểm tra luôn chi phí trigger).
-- ============================================================================================

-- ======================================= PHẦN A: hàm sinh dữ liệu =======================================
create schema if not exists perf_synth;
create sequence if not exists perf_synth.plan_seq;
create sequence if not exists perf_synth.detail_seq;

create or replace function perf_synth.guard() returns void language plpgsql as $$
begin
  if coalesce(current_setting('perf.allow_existing', true), '') <> 'yes'
     and (exists (select 1 from public.inspection_details where import_ref is null or import_ref not like 'synthetic-%')
          or exists (select 1 from public.transport_plans where tk_number not like 'TKS%')) then
    raise exception 'DỪNG: DB có dữ liệu không phải giả - đây có thể là DB thật. Chỉ chạy trên DB thử/branch.';
  end if;
end $$;

-- Danh mục giả (một lần): kind, số lượng. Công trình có code 'SYN-C<n>'.
create or replace function perf_synth.seed_lookups() returns void language plpgsql as $$
begin
  perform perf_synth.guard();
  if exists (select 1 from public.lookup_items where kind = 'transport_type' and name = 'SYN transport_type 5') then
    return;
  end if;
  insert into public.lookup_items (kind, name, code)
  select k.kind, 'SYN ' || k.kind || ' ' || g, case when k.kind = 'construction' then 'SYN-C' || g end
  from (values ('export_type', 11), ('product', 500), ('unit', 20), ('carrier', 15), ('receiving_unit', 2000),
               ('construction', 20000), ('vehicle', 300), ('driver', 300), ('fg_exporter', 50),
               ('material_exporter', 100), ('transport_type', 5)) as k(kind, n)
  cross join lateral generate_series(1, k.n) as g
  on conflict do nothing;
end $$;

-- Thêm p_rows phiếu giả. Số phiếu TKS<năm 2000+>/<tháng>-<4 số>, không đụng số thật (năm >= 2023).
create or replace function perf_synth.add_plans(p_rows int default 100000) returns bigint language plpgsql as $$
declare
  v_veh bigint[]; v_drv bigint[]; v_fg bigint[]; v_cnt bigint;
begin
  perform perf_synth.guard();
  perform perf_synth.seed_lookups();
  select array_agg(id) into v_veh from public.lookup_items where kind = 'vehicle' and name like 'SYN %';
  select array_agg(id) into v_drv from public.lookup_items where kind = 'driver' and name like 'SYN %';
  select array_agg(id) into v_fg from public.lookup_items where kind = 'fg_exporter' and name like 'SYN %';
  insert into public.transport_plans (tk_number, tk_year, tk_month, tk_seq, export_date, transport_order_no,
                                      vehicle_id, driver_id, fg_exporter_id, created_at)
  select format('TKS%s/%s-%s', 2000 + (s.n - 1) / (12 * 9999), lpad((1 + ((s.n - 1) / 9999) % 12)::text, 2, '0'),
                lpad((1 + (s.n - 1) % 9999)::text, 4, '0')),
         (2000 + (s.n - 1) / (12 * 9999))::int, (1 + ((s.n - 1) / 9999) % 12)::int, (1 + (s.n - 1) % 9999)::int,
         date '2020-01-01' + (random() * 2556)::int, 'LVC-' || s.n,
         v_veh[1 + floor(random() * cardinality(v_veh))::int],
         v_drv[1 + floor(random() * cardinality(v_drv))::int],
         v_fg[1 + floor(random() * cardinality(v_fg))::int],
         now() - random() * interval '1800 days'
  from (select nextval('perf_synth.plan_seq') as n from generate_series(1, p_rows)) s;
  get diagnostics v_cnt = row_count;
  return v_cnt;
end $$;

-- Thêm p_rows dòng bảng kiểm giả (cần đã có phiếu giả). ~1% dòng không có ngày xuất.
create or replace function perf_synth.add_details(p_rows int default 100000) returns bigint language plpgsql as $$
declare
  v_plans bigint[]; v_con bigint[]; v_ru bigint[]; v_et bigint[]; v_pr bigint[]; v_un bigint[]; v_ca bigint[];
  v_du bigint; v_cnt bigint;
begin
  perform perf_synth.guard();
  perform perf_synth.seed_lookups();
  select array_agg(id) into v_plans from public.transport_plans where tk_number like 'TKS%';
  if v_plans is null then raise exception 'Chưa có phiếu giả: chạy perf_synth.add_plans trước.'; end if;
  select array_agg(id) into v_con from public.lookup_items where kind = 'construction' and code like 'SYN-C%';
  select array_agg(id) into v_ru from public.lookup_items where kind = 'receiving_unit' and name like 'SYN %';
  select array_agg(id) into v_et from public.lookup_items where kind = 'export_type' and name like 'SYN %';
  select array_agg(id) into v_pr from public.lookup_items where kind = 'product' and name like 'SYN %';
  select array_agg(id) into v_un from public.lookup_items where kind = 'unit' and name like 'SYN %';
  select array_agg(id) into v_ca from public.lookup_items where kind = 'carrier' and name like 'SYN %';
  select id into v_du from public.lookup_items where kind = 'delivery_unit' order by id limit 1;
  insert into public.inspection_details (plan_id, export_date, warehouse_slip_no, construction_id, delivery_unit_id,
      receiving_unit_id, export_type_id, product_id, unit_id, carrier_id, work_item, quantity, total_weight_kg,
      note, created_at, import_ref)
  select v_plans[1 + floor(random() * cardinality(v_plans))::int],
         case when random() < 0.01 then null else date '2020-01-01' + (random() * 2556)::int end,
         'PXK-' || s.n,
         v_con[1 + floor(random() * cardinality(v_con))::int], v_du,
         v_ru[1 + floor(random() * cardinality(v_ru))::int],
         v_et[1 + floor(random() * cardinality(v_et))::int],
         v_pr[1 + floor(random() * cardinality(v_pr))::int],
         v_un[1 + floor(random() * cardinality(v_un))::int],
         v_ca[1 + floor(random() * cardinality(v_ca))::int],
         'Hạng mục ' || (s.n % 1000), round((random() * 500)::numeric, 3), round((random() * 5000)::numeric, 3),
         null, now() - random() * interval '1800 days', 'synthetic-' || s.n
  from (select nextval('perf_synth.detail_seq') as n from generate_series(1, p_rows)) s;
  get diagnostics v_cnt = row_count;
  return v_cnt;
end $$;

-- ======================================= PHẦN B: thống kê planner =======================================
analyze public.transport_plans;
analyze public.inspection_details;
analyze public.inspection_daily_stats;
analyze public.lookup_items;

-- ======================================= PHẦN C: explain (analyze, buffers) =======================================
-- Quy tắc chung: không "Seq Scan" trên transport_plans/inspection_details (trừ câu ghi chú), không "Sort" lớn
-- trên toàn bảng, "Execution Time" nhỏ hơn ngưỡng sau khi chạy lần 2 (cache nóng). Buffers: shared hit+read
-- của một trang 50 dòng nên < 2.000; nếu hàng chục nghìn là sai index. Ngưỡng tính cho ~1 triệu dòng bảng kiểm,
-- 500.000 phiếu; cộng thêm tối đa 2x cho vài triệu dòng.

-- C1. Phiếu: trang đầu. Ngưỡng < 20 ms. Mong đợi: Index Scan transport_plans_created_at_id_idx, không Sort.
explain (analyze, buffers) select * from public.transport_plans order by created_at desc, id desc limit 50;

-- C2. Phiếu: trang sâu (offset). Ngưỡng < 150 ms với offset 10.000. Quá chậm khi offset > 100.000 -> FE không cho nhảy trang sâu.
explain (analyze, buffers) select * from public.transport_plans order by created_at desc, id desc limit 50 offset 10000;

-- C3. Phiếu: lọc khoảng ngày xuất. Ngưỡng < 30 ms. Mong đợi: transport_plans_export_date_id_idx.
explain (analyze, buffers) select * from public.transport_plans
  where export_date >= '2025-01-01' and export_date < '2025-02-01' order by export_date desc, id desc limit 50;

-- C4. Bảng kiểm (view): trang đầu. Ngưỡng < 50 ms. Mong đợi: inspection_details_created_at_id_idx rồi nested loop 50 dòng.
explain (analyze, buffers) select * from public.inspection_details_view order by created_at desc, id desc limit 50;

-- C5. Bảng kiểm: trang sâu offset 10.000. Ngưỡng < 300 ms.
explain (analyze, buffers) select * from public.inspection_details_view order by created_at desc, id desc limit 50 offset 10000;

-- C6. Bảng kiểm: lọc khoảng ngày (sắp theo ngày xuất). Ngưỡng < 50 ms. Mong đợi: inspection_details_export_date_id_idx.
explain (analyze, buffers) select * from public.inspection_details_view
  where export_date >= '2025-01-01' and export_date < '2025-02-01' order by export_date desc, id desc limit 50;

-- C7. Bảng kiểm: lọc công trình theo id (sắp mới nhất). Ngưỡng < 30 ms. Mong đợi: Index/Bitmap inspection_details_construction_id_idx.
explain (analyze, buffers) select * from public.inspection_details_view
  where construction_id = (select id from public.lookup_items where kind = 'construction' and code = 'SYN-C100')
  order by created_at desc, id desc limit 50;

-- C8. Bảng kiểm: lọc đơn vị nhận theo id. Ngưỡng < 100 ms (mỗi đơn vị nhận ~ 500 dòng ở 1 triệu).
explain (analyze, buffers) select * from public.inspection_details_view
  where receiving_unit_id = (select id from public.lookup_items where kind = 'receiving_unit' and name = 'SYN receiving_unit 100')
  order by created_at desc, id desc limit 50;

-- C9. Bảng kiểm: theo phiếu (plan_id). Ngưỡng < 10 ms.
explain (analyze, buffers) select * from public.inspection_details_view
  where plan_id = (select id from public.transport_plans where tk_number = 'TKS2000/01-0005');

-- C10. Bảng kiểm: tìm theo số phiếu xuất kho (ilike, GIN trigram). Ngưỡng < 100 ms với từ khóa >= 3 ký tự.
explain (analyze, buffers) select * from public.inspection_details_view
  where warehouse_slip_no ilike '%PXK-12345%' order by created_at desc, id desc limit 50;

-- C11. Tìm số TK trong combobox (hàm: chỉ thấy Function Scan, đo tổng thời gian). Ngưỡng < 30 ms mỗi câu.
explain (analyze, buffers) select * from public.search_plan_numbers('');
explain (analyze, buffers) select * from public.search_plan_numbers('2000/01-00');
explain (analyze, buffers) select * from public.search_plan_numbers('TKS2000/01-0005', 20);
explain (analyze, buffers) select * from public.search_plan_numbers('TK');   -- 1-2 ký tự: chỉ khớp đầu chuỗi, ngưỡng < 30 ms

-- C12. Tìm danh mục lớn. Ngưỡng < 30 ms mỗi câu.
explain (analyze, buffers) select * from public.search_lookup_items('construction', '');
explain (analyze, buffers) select * from public.search_lookup_items('construction', 'SYN-C123');
explain (analyze, buffers) select * from public.search_lookup_items('receiving_unit', 'receiving_unit 19');
explain (analyze, buffers) select * from public.get_lookup_items(array[1,2,3,4,5]::bigint[]);   -- < 5 ms

-- C13. Thống kê từ bảng tổng hợp (bao nhiêu dòng bảng kiểm cũng gần như không đổi). Ngưỡng < 50 ms mỗi câu.
explain (analyze, buffers) select public.inspection_weight_total('2025-01-01', '2025-02-01');
explain (analyze, buffers) select * from public.inspection_stats('2025-01-01', '2026-01-01', 'export_type');
explain (analyze, buffers) select * from public.inspection_stats('2025-01-01', '2026-01-01', 'month');
explain (analyze, buffers) select * from public.inspection_stats('2025-01-01', '2025-02-01', 'product');
-- Đối chiếu tính đúng (hai số phải bằng nhau; câu thứ hai quét bảng gốc nên chậm, chỉ để kiểm):
select public.inspection_weight_total('2025-01-01', '2025-02-01');
select coalesce(sum(total_weight_kg), 0) from public.inspection_details where export_date >= '2025-01-01' and export_date < '2025-02-01';

-- C14. Đếm ước lượng (cách PostgREST count=estimated): đọc từ planner, phải ~ tức thì (< 5 ms), sai lệch < 10% sau analyze.
explain select * from public.inspection_details;
select reltuples::bigint as estimated from pg_class where oid = 'public.inspection_details'::regclass;
-- count(*) chính xác để so sánh: CHẬM trên triệu dòng (hàng trăm ms) - FE không dùng cho bảng lớn.
explain (analyze, buffers) select count(*) from public.inspection_details;

-- C15. Chi phí trigger tổng hợp khi ghi (mỗi khối tự rollback, không để lại dữ liệu).
-- Thêm 1 dòng: Execution Time < 10 ms (gồm thời gian trigger). Thêm 1000 dòng một câu: < 300 ms.
begin;
explain (analyze, buffers) insert into public.inspection_details (plan_id, export_date, total_weight_kg, quantity, import_ref)
  select plan_id, export_date, 10, 1, 'synthetic-trial-1' from public.inspection_details limit 1;
rollback;
begin;
explain (analyze, buffers) insert into public.inspection_details (plan_id, export_date, total_weight_kg, quantity, import_ref)
  select plan_id, export_date, 10, 1, 'synthetic-trial-' || id from public.inspection_details limit 1000;
rollback;
-- Sửa 1000 dòng (đổi ghi chú): < 300 ms. Xóa 1000 dòng: < 300 ms.
begin;
explain (analyze, buffers) update public.inspection_details set note = 'x' where id in (select id from public.inspection_details limit 1000);
rollback;
begin;
explain (analyze, buffers) delete from public.inspection_details where id in (select id from public.inspection_details limit 1000);
rollback;

-- C16. Kiểm tra bảng tổng hợp khớp sau khi sinh (mong đợi: hai cột bằng nhau, 0 lệch).
select (select sum(row_count) from public.inspection_daily_stats) as stats_rows,
       (select count(*) from public.inspection_details) as detail_rows,
       (select sum(weight_kg_sum) from public.inspection_daily_stats) as stats_kg,
       (select sum(total_weight_kg) from public.inspection_details) as detail_kg;
-- Kích thước bảng/index (ghi vào docs/performance.md khi đo):
select relname, pg_size_pretty(pg_total_relation_size(oid)) as total, pg_size_pretty(pg_relation_size(oid)) as heap
from pg_class where relname in ('inspection_details', 'transport_plans', 'lookup_items', 'inspection_daily_stats');

-- ======================================= PHẦN D: dọn (hoặc bỏ cả branch) =======================================
-- Bỏ comment từng câu khi cần. Xóa hàng triệu dòng chậm - branch thì bỏ branch cho nhanh.
-- delete from public.inspection_details where import_ref like 'synthetic-%';
-- delete from public.transport_plans where tk_number like 'TKS%';
-- delete from public.lookup_items where name like 'SYN %';
-- drop schema perf_synth cascade;
-- select public.rebuild_inspection_daily_stats();   -- dựng lại bảng tổng hợp cho chắc
