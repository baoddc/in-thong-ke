-- T-021 / D-011: nạp dữ liệu cũ từ bảng tạm import_plans / import_details vào bảng thật.
-- KHÔNG phải migration. Chạy sau khi: (1) migration 20261029000005 đã áp, (2) người dùng đã import 2 CSV vào bảng tạm.
-- Lead chạy TỪNG CÂU (mỗi mục "-- [x]" là đúng một câu SQL, kết thúc bằng dấu ;). Chỉ INSERT/UPDATE/SELECT.
-- Chạy lại được: mọi INSERT đều loại bản ghi đã có (so khớp không phân biệt hoa thường, on conflict do nothing).
-- Quy ước: giá trị rỗng/null trong bảng tạm = trống; số/ngày không đọc được -> để trống (bước 0b/6d đếm trước/sau).
-- Quy trình: 0a..0f (đọc kết quả, báo người dùng nếu bất thường) -> 1a -> 1b -> 2 -> (3 đã gộp vào 2) -> 4 -> 5 -> 6a..6e.

-- =====================================================================
-- BƯỚC 0. KIỂM TRA TRƯỚC (chỉ SELECT)
-- =====================================================================

-- [0a] Số dòng
select
  (select count(*) from public.import_plans)                                   as plans_rows,
  (select count(distinct btrim(tk_number)) from public.import_plans)           as plans_distinct_tk,
  (select count(*) from public.import_details)                                 as details_rows,
  (select count(distinct btrim(import_ref)) from public.import_details)        as details_distinct_ref,
  (select count(*) from public.import_details where nullif(btrim(tk_number), '') is null) as details_without_tk,
  (select count(*) from public.lookup_items)                                   as db_lookup_items,
  (select count(*) from public.transport_plans)                                as db_transport_plans,
  (select count(*) from public.inspection_details)                             as db_inspection_details;

-- [0b] Kiểm định dạng (số lớn hơn 0 = sẽ bị bỏ trống/bỏ qua; cần báo người dùng)
select
  (select count(*) from public.import_plans
     where nullif(btrim(export_date), '') is not null and btrim(export_date) !~ '^\d{4}-\d{2}-\d{2}$')   as plans_bad_date,
  (select count(*) from public.import_plans
     where coalesce(btrim(tk_number), '') = '')                                                          as plans_empty_tk,
  (select count(*) from public.import_plans
     where coalesce(btrim(tk_year) !~ '^\d+$', true) or coalesce(btrim(tk_month) !~ '^\d+$', true)
        or coalesce(btrim(tk_seq) !~ '^\d+$', true))                                                     as plans_bad_int,
  (select count(*) from public.import_plans
     where btrim(tk_month) ~ '^\d+$' and btrim(tk_seq) ~ '^\d+$'
       and (case when btrim(tk_month) ~ '^\d{1,9}$' then btrim(tk_month)::int not between 1 and 12 else true end
         or case when btrim(tk_seq) ~ '^\d{1,9}$' then btrim(tk_seq)::int not between 1 and 9999 else true end)) as plans_out_of_range,
  (select count(*) from public.import_details
     where nullif(btrim(export_date), '') is not null and btrim(export_date) !~ '^\d{4}-\d{2}-\d{2}$')   as details_bad_date,
  (select count(*) from public.import_details
     where nullif(btrim(quantity), '') is not null and btrim(quantity) !~ '^\d+(\.\d+)?$')               as details_bad_quantity,
  (select count(*) from public.import_details
     where nullif(btrim(total_weight_kg), '') is not null and btrim(total_weight_kg) !~ '^\d+(\.\d+)?$') as details_bad_weight,
  (select count(*) from public.import_details where nullif(btrim(import_ref), '') is null)               as details_empty_ref,
  (select count(*) from (select 1 from public.import_details where nullif(btrim(import_ref), '') is not null
                         group by btrim(import_ref) having count(*) > 1) x)                              as details_dup_ref;

-- [0c] Số TK trong import_plans đã có trên transport_plans (sẽ KHÔNG bị ghi đè)
select count(*) over () as total, btrim(p.tk_number) as tk_number, t.id as db_plan_id,
       t.export_date as db_export_date, nullif(btrim(p.export_date), '') as csv_export_date
from public.import_plans p
join public.transport_plans t on t.tk_number = btrim(p.tk_number)
order by t.id
limit 100;

-- [0d] Va chạm (tk_year, tk_month, tk_seq) giữa các số TK khác chuỗi, và số TK trùng trong bảng tạm
with pp as (
  select btrim(tk_number) as tk_number,
         case when btrim(tk_year)  ~ '^\d{1,9}$' then btrim(tk_year)::int  end as y,
         case when btrim(tk_month) ~ '^\d{1,9}$' then btrim(tk_month)::int end as m,
         case when btrim(tk_seq)   ~ '^\d{1,9}$' then btrim(tk_seq)::int   end as s
  from public.import_plans
)
select 'trùng số TK trong bảng tạm' as loai, tk_number as chi_tiet, count(*)::text as so_dong
from pp where tk_number <> '' group by tk_number having count(*) > 1
union all
select 'cùng (năm,tháng,số) khác chuỗi - trong bảng tạm', y || '/' || m || '-' || s, string_agg(distinct tk_number, ' | ')
from pp where y is not null and m is not null and s is not null
group by y, m, s having count(distinct tk_number) > 1
union all
select 'cùng (năm,tháng,số) khác chuỗi - với DB', pp.tk_number, string_agg(distinct t.tk_number, ' | ')
from pp join public.transport_plans t on t.tk_year = pp.y and t.tk_month = pp.m and t.tk_seq = pp.s and t.tk_number <> pp.tk_number
group by pp.tk_number
order by 1, 2
limit 200;

-- [0e] Tên chưa có trong lookup_items theo từng kind (đếm + tối đa 20 ví dụ). 'fg_exporter (từ shipper)' = shipper sẽ thêm vào fg_exporter.
with src as (
  select 'transport_type' as k, btrim(transport_type) as n from public.import_plans
  union all select 'vehicle', btrim(vehicle) from public.import_plans
  union all select 'driver', btrim(driver) from public.import_plans
  union all select 'fg_exporter', btrim(fg_exporter) from public.import_plans
  union all select 'material_exporter', btrim(material_exporter) from public.import_plans
  union all select 'receiving_unit', btrim(receiving_unit) from public.import_details
  union all select 'delivery_unit', btrim(delivery_unit) from public.import_details
  union all select 'export_type', btrim(export_type) from public.import_details
  union all select 'product', btrim(product) from public.import_details
  union all select 'unit', btrim(unit) from public.import_details
  union all select 'carrier', btrim(carrier) from public.import_details
), allsrc as (
  select k, n from src where n <> ''
  union all
  select 'fg_exporter (từ shipper)', btrim(d.shipper)
  from public.import_details d
  where btrim(d.shipper) <> ''
    and not exists (select 1 from src x where x.k in ('fg_exporter', 'material_exporter') and lower(x.n) = lower(btrim(d.shipper)))
    and not exists (select 1 from public.lookup_items l where l.kind in ('fg_exporter', 'material_exporter') and lower(l.name) = lower(btrim(d.shipper)))
), missing as (
  select distinct on (a.k, lower(a.n)) a.k, a.n
  from allsrc a
  where not exists (select 1 from public.lookup_items l
                    where l.kind = split_part(a.k, ' ', 1) and lower(l.name) = lower(a.n))
  order by a.k, lower(a.n), a.n
)
select k as kind, count(*) as so_ten_thieu, (array_agg(n order by n))[1:20] as vi_du
from missing group by k order by k;

-- [0f] Mã công trình chưa có (kind construction, so theo code không phân biệt hoa thường)
select count(*) as so_ma_thieu, (array_agg(code order by code))[1:20] as vi_du
from (select distinct on (lower(btrim(construction_code))) btrim(construction_code) as code
      from public.import_details
      where btrim(construction_code) <> ''
      order by lower(btrim(construction_code)), btrim(construction_code)) c
where not exists (select 1 from public.lookup_items l where l.kind = 'construction' and lower(l.code) = lower(c.code));

-- =====================================================================
-- BƯỚC 1. THÊM DANH MỤC CÒN THIẾU
-- =====================================================================

-- [1a] Danh mục theo tên. Trả số dòng đã thêm theo kind.
with src as (
  select 'transport_type' as k, btrim(transport_type) as n from public.import_plans
  union all select 'vehicle', btrim(vehicle) from public.import_plans
  union all select 'driver', btrim(driver) from public.import_plans
  union all select 'fg_exporter', btrim(fg_exporter) from public.import_plans
  union all select 'material_exporter', btrim(material_exporter) from public.import_plans
  union all select 'receiving_unit', btrim(receiving_unit) from public.import_details
  union all select 'delivery_unit', btrim(delivery_unit) from public.import_details
  union all select 'export_type', btrim(export_type) from public.import_details
  union all select 'product', btrim(product) from public.import_details
  union all select 'unit', btrim(unit) from public.import_details
  union all select 'carrier', btrim(carrier) from public.import_details
), allsrc as (
  select k, n from src where n <> ''
  union all
  -- shipper chưa có ở fg_exporter lẫn material_exporter (cả trong bảng tạm lẫn DB) -> thêm vào fg_exporter
  select 'fg_exporter', btrim(d.shipper)
  from public.import_details d
  where btrim(d.shipper) <> ''
    and not exists (select 1 from src x where x.k in ('fg_exporter', 'material_exporter') and lower(x.n) = lower(btrim(d.shipper)))
    and not exists (select 1 from public.lookup_items l where l.kind in ('fg_exporter', 'material_exporter') and lower(l.name) = lower(btrim(d.shipper)))
), ins as (
  insert into public.lookup_items (kind, name)
  select distinct on (a.k, lower(a.n)) a.k, a.n
  from allsrc a
  where not exists (select 1 from public.lookup_items l where l.kind = a.k and lower(l.name) = lower(a.n))
  order by a.k, lower(a.n), a.n
  on conflict do nothing
  returning kind
)
select kind, count(*) as da_them from ins group by kind order by kind;

-- [1b] Công trình: mã chưa có -> thêm (code = mã, name = mã). Trả số đã thêm.
with c as (
  select distinct on (lower(btrim(construction_code))) btrim(construction_code) as code
  from public.import_details
  where btrim(construction_code) <> ''
  order by lower(btrim(construction_code)), btrim(construction_code)
), ins as (
  insert into public.lookup_items (kind, code, name)
  select 'construction', c.code, c.code from c
  where not exists (select 1 from public.lookup_items l where l.kind = 'construction' and lower(l.code) = lower(c.code))
  on conflict do nothing
  returning 1
)
select count(*) as cong_trinh_da_them from ins;

-- =====================================================================
-- BƯỚC 2 (+3). PHIẾU TK VÀ NV XUẤT VT (gộp một câu để chỉ thêm NV xuất VT cho phiếu vừa nạp)
-- - Số TK đã có trên DB: bỏ qua (on conflict (tk_number) do nothing), kể cả NV xuất VT.
-- - Va chạm (năm,tháng,số) với số TK khác chuỗi (trong bảng tạm hoặc với DB): bỏ dòng đó, bước 6e báo.
-- - created_at = ngày xuất 00:00 giờ VN (bản in lấy "Ngày lập" từ đây), không có thì now().
-- =====================================================================

-- [2] Trả số phiếu và số dòng NV xuất VT đã thêm.
with pp as (
  select nullif(btrim(tk_number), '') as tk_number,
         case when btrim(tk_year)  ~ '^\d{1,9}$' then btrim(tk_year)::int  end as y,
         case when btrim(tk_month) ~ '^\d{1,9}$' then btrim(tk_month)::int end as m,
         case when btrim(tk_seq)   ~ '^\d{1,9}$' then btrim(tk_seq)::int   end as s,
         case when btrim(export_date) ~ '^\d{4}-\d{2}-\d{2}$' then btrim(export_date)::date end as ed,
         nullif(btrim(transport_order_no), '') as transport_order_no,
         nullif(btrim(transport_type), '') as transport_type,
         nullif(btrim(vehicle), '') as vehicle,
         nullif(btrim(driver), '') as driver,
         nullif(btrim(fg_exporter), '') as fg_exporter,
         nullif(btrim(material_exporter), '') as material_exporter,
         nullif(btrim(note), '') as note,
         case when regexp_replace(coalesce(source_row, ''), '\D', '', 'g') <> ''
              then left(regexp_replace(source_row, '\D', '', 'g'), 15)::bigint end as src_row
  from public.import_plans
), dedup as (
  select distinct on (tk_number) *
  from pp
  where tk_number is not null and y is not null and m between 1 and 12 and s between 1 and 9999
  order by tk_number, src_row
), ranked as (
  select *, row_number() over (partition by y, m, s order by src_row, tk_number) as rn from dedup
), cand as (
  select r.*, tt.id as tt_id, ve.id as ve_id, dr.id as dr_id, fg.id as fg_id, mx.id as mx_id
  from ranked r
  left join public.lookup_items tt on tt.kind = 'transport_type'    and lower(tt.name) = lower(r.transport_type)
  left join public.lookup_items ve on ve.kind = 'vehicle'           and lower(ve.name) = lower(r.vehicle)
  left join public.lookup_items dr on dr.kind = 'driver'            and lower(dr.name) = lower(r.driver)
  left join public.lookup_items fg on fg.kind = 'fg_exporter'       and lower(fg.name) = lower(r.fg_exporter)
  left join public.lookup_items mx on mx.kind = 'material_exporter' and lower(mx.name) = lower(r.material_exporter)
  where r.rn = 1
    and not exists (select 1 from public.transport_plans t
                    where t.tk_year = r.y and t.tk_month = r.m and t.tk_seq = r.s and t.tk_number <> r.tk_number)
), ins as (
  insert into public.transport_plans (tk_number, tk_year, tk_month, tk_seq, export_date, transport_order_no,
    transport_type_id, vehicle_id, driver_id, fg_exporter_id, note, created_at)
  select tk_number, y, m, s, ed, transport_order_no, tt_id, ve_id, dr_id, fg_id, note,
         coalesce(ed::timestamp at time zone 'Asia/Ho_Chi_Minh', now())
  from cand
  order by y, m, s
  on conflict (tk_number) do nothing
  returning id, tk_number
), ins_mx as (
  insert into public.transport_plan_material_exporters (plan_id, lookup_id, sort_order)
  select ins.id, c.mx_id, 0 from ins join cand c on c.tk_number = ins.tk_number
  where c.mx_id is not null
  on conflict do nothing
  returning 1
)
select (select count(*) from ins) as phieu_da_them, (select count(*) from ins_mx) as nv_xuat_vt_da_them;

-- =====================================================================
-- BƯỚC 3. (đã gộp vào bước 2 — không chạy riêng)
-- =====================================================================

-- =====================================================================
-- BƯỚC 4. BẢNG KIỂM CHI TIẾT (~42k dòng, một câu server-side)
-- - plan_id theo tk_number (null nếu rỗng/không thấy); dòng không có import_ref bị bỏ (không nạp lại an toàn được).
-- - shipper_id chỉ ghi khi người đó KHÁC NV xuất theo phiếu (TP/BTP, rồi NV xuất VT đầu tiên) - như D-010; không có phiếu -> ghi luôn.
-- - Số/ngày không đọc được hoặc số âm -> để trống (đã đếm ở 0b). created_at = ngày xuất 00:00 giờ VN, không có thì now().
-- - Nếu bị timeout: thêm vào cuối mệnh đề "from b" điều kiện "where b.src_row between X and Y" rồi chạy từng khoảng
--   (import_ref đảm bảo không trùng).
-- =====================================================================

-- [4] Trả số dòng đã thêm.
with b as (
  select nullif(btrim(import_ref), '') as ref,
         nullif(btrim(tk_number), '') as tk,
         case when btrim(export_date) ~ '^\d{4}-\d{2}-\d{2}$' then btrim(export_date)::date end as ed,
         nullif(btrim(warehouse_slip_no), '') as slip,
         nullif(btrim(construction_code), '') as cons,
         nullif(btrim(work_item), '') as work_item,
         nullif(btrim(delivery_unit), '') as du,
         nullif(btrim(receiving_unit), '') as ru,
         nullif(btrim(export_type), '') as et,
         nullif(btrim(product), '') as pr,
         nullif(btrim(unit), '') as un,
         nullif(btrim(carrier), '') as ca,
         nullif(btrim(shipper), '') as shipper,
         case when btrim(quantity) ~ '^\d{1,15}(\.\d+)?$' then btrim(quantity)::numeric end as qty,
         case when btrim(total_weight_kg) ~ '^\d{1,15}(\.\d+)?$' then btrim(total_weight_kg)::numeric end as wt,
         nullif(btrim(note), '') as note,
         case when regexp_replace(coalesce(source_row, ''), '\D', '', 'g') <> ''
              then left(regexp_replace(source_row, '\D', '', 'g'), 15)::bigint end as src_row
  from public.import_details
), ins as (
  insert into public.inspection_details (plan_id, export_date, warehouse_slip_no, construction_id, delivery_unit_id,
    receiving_unit_id, export_type_id, product_id, unit_id, carrier_id, shipper_id, work_item, quantity,
    total_weight_kg, note, import_ref, created_at)
  select p.id, b.ed, b.slip, con.id, du.id, ru.id, et.id, pr.id, un.id, ca.id,
         case when coalesce(shf.id, shm.id) is not null
               and lower(coalesce(shf.name, shm.name)) is distinct from lower(coalesce(fg.name, mx.name))
              then coalesce(shf.id, shm.id) end,
         b.work_item, b.qty, b.wt, b.note, b.ref,
         coalesce(b.ed::timestamp at time zone 'Asia/Ho_Chi_Minh', now())
  from b
  left join public.transport_plans p on p.tk_number = b.tk
  left join public.lookup_items con on con.kind = 'construction'  and lower(con.code) = lower(b.cons)
  left join public.lookup_items du  on du.kind  = 'delivery_unit' and lower(du.name)  = lower(b.du)
  left join public.lookup_items ru  on ru.kind  = 'receiving_unit' and lower(ru.name) = lower(b.ru)
  left join public.lookup_items et  on et.kind  = 'export_type'   and lower(et.name)  = lower(b.et)
  left join public.lookup_items pr  on pr.kind  = 'product'       and lower(pr.name)  = lower(b.pr)
  left join public.lookup_items un  on un.kind  = 'unit'          and lower(un.name)  = lower(b.un)
  left join public.lookup_items ca  on ca.kind  = 'carrier'       and lower(ca.name)  = lower(b.ca)
  left join public.lookup_items shf on shf.kind = 'fg_exporter'       and lower(shf.name) = lower(b.shipper)
  left join public.lookup_items shm on shm.kind = 'material_exporter' and lower(shm.name) = lower(b.shipper)
  left join public.lookup_items fg  on fg.id = p.fg_exporter_id
  left join lateral (
    select l.name
    from public.transport_plan_material_exporters m
    join public.lookup_items l on l.id = m.lookup_id
    where m.plan_id = p.id
    order by m.sort_order, m.lookup_id
    limit 1
  ) mx on true
  where b.ref is not null
  order by b.src_row, b.ref
  on conflict (import_ref) where import_ref is not null do nothing
  returning 1
)
select count(*) as dong_da_them from ins;

-- =====================================================================
-- BƯỚC 5. ĐỒNG BỘ SEQUENCE (an toàn dù không ghi id tay)
-- =====================================================================

-- [5]
select 'lookup_items' as bang, setval(pg_get_serial_sequence('public.lookup_items', 'id'), coalesce(max(id), 1), max(id) is not null) as seq from public.lookup_items
union all
select 'transport_plans', setval(pg_get_serial_sequence('public.transport_plans', 'id'), coalesce(max(id), 1), max(id) is not null) from public.transport_plans
union all
select 'inspection_details', setval(pg_get_serial_sequence('public.inspection_details', 'id'), coalesce(max(id), 1), max(id) is not null) from public.inspection_details;

-- =====================================================================
-- BƯỚC 6. ĐỐI CHIẾU SAU NẠP (chỉ SELECT)
-- =====================================================================

-- [6a] Số lượng: bảng tạm so với DB
select
  (select count(distinct btrim(tk_number)) from public.import_plans where btrim(tk_number) <> '')           as csv_phieu,
  (select count(*) from public.transport_plans t
     where t.tk_number in (select btrim(tk_number) from public.import_plans))                              as db_phieu_khop,
  (select count(distinct btrim(import_ref)) from public.import_details where btrim(import_ref) <> '')       as csv_dong_kiem,
  (select count(*) from public.inspection_details where import_ref is not null)                            as db_dong_kiem_import,
  (select count(*) from public.inspection_details where import_ref is not null and plan_id is null)        as db_dong_khong_phieu;

-- [6b] Tổng khối lượng (kg) theo loại hình xuất, dòng đã nạp - đối chiếu sheet Chart
select coalesce(et.name, '(trống)') as export_type, count(*) as so_dong, sum(d.total_weight_kg) as tong_kg
from public.inspection_details d
left join public.lookup_items et on et.id = d.export_type_id
where d.import_ref is not null
group by et.name
order by et.name nulls last;

-- [6c] Tổng khối lượng: bảng tạm (đọc được) so với DB
select
  (select sum(btrim(total_weight_kg)::numeric) from public.import_details
     where btrim(total_weight_kg) ~ '^\d{1,15}(\.\d+)?$'
       and nullif(btrim(import_ref), '') is not null)                                  as csv_tong_kg,
  (select sum(total_weight_kg) from public.inspection_details where import_ref is not null) as db_tong_kg;

-- [6d] Cảnh báo dòng bảng kiểm (số dòng > 0 cần báo người dùng)
select 'import_ref rỗng - không nạp' as van_de, count(*) as so_dong
from public.import_details where nullif(btrim(import_ref), '') is null
union all
select 'import_ref trùng trong bảng tạm - chỉ nạp dòng đầu', count(*) - count(distinct btrim(import_ref))
from public.import_details where nullif(btrim(import_ref), '') is not null
union all
select 'có số TK nhưng không thấy phiếu - nạp với plan_id trống', count(*)
from public.import_details d
where nullif(btrim(d.tk_number), '') is not null
  and not exists (select 1 from public.transport_plans t where t.tk_number = btrim(d.tk_number))
union all
select 'ngày xuất không đọc được - để trống', count(*)
from public.import_details where nullif(btrim(export_date), '') is not null and btrim(export_date) !~ '^\d{4}-\d{2}-\d{2}$'
union all
select 'số lượng không đọc được/âm - để trống', count(*)
from public.import_details where nullif(btrim(quantity), '') is not null and btrim(quantity) !~ '^\d{1,15}(\.\d+)?$'
union all
select 'khối lượng không đọc được/âm - để trống', count(*)
from public.import_details where nullif(btrim(total_weight_kg), '') is not null and btrim(total_weight_kg) !~ '^\d{1,15}(\.\d+)?$'
union all
select 'có mã công trình nhưng không khớp danh mục', count(*)
from public.import_details d
where nullif(btrim(d.construction_code), '') is not null
  and not exists (select 1 from public.lookup_items l where l.kind = 'construction' and lower(l.code) = lower(btrim(d.construction_code)));

-- [6e] Phiếu trong bảng tạm chưa vào DB và lý do (tối đa 200)
select btrim(p.tk_number) as tk_number, p.tk_year, p.tk_month, p.tk_seq,
  case
    when coalesce(btrim(p.tk_number), '') = '' then 'số TK rỗng'
    when coalesce(btrim(p.tk_year) !~ '^\d{1,9}$', true) or coalesce(btrim(p.tk_month) !~ '^\d{1,9}$', true)
      or coalesce(btrim(p.tk_seq) !~ '^\d{1,9}$', true) then 'năm/tháng/số không phải số nguyên'
    when btrim(p.tk_month)::int not between 1 and 12 or btrim(p.tk_seq)::int not between 1 and 9999 then 'tháng hoặc số ngoài khoảng'
    when exists (select 1 from public.transport_plans t
                 where t.tk_year = btrim(p.tk_year)::int and t.tk_month = btrim(p.tk_month)::int and t.tk_seq = btrim(p.tk_seq)::int
                   and t.tk_number <> btrim(p.tk_number)) then 'va chạm (năm,tháng,số) với số TK khác chuỗi'
    else 'khác (kiểm tra thủ công)'
  end as ly_do
from public.import_plans p
where not exists (select 1 from public.transport_plans t where t.tk_number = btrim(p.tk_number))
order by 1
limit 200;
