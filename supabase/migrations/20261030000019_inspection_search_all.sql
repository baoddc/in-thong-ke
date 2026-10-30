-- T-061 / D-022: ô Tìm nhanh trang Bảng kiểm khớp mọi cột hiển thị. Chạy lại được (create or replace / if not exists).
-- Phụ thuộc 000008 (f_search_norm, GIN norm của lookup_items), 000009 (profiles, is_active_user), 000016 (bản trước của list/count).
-- Chữ ký, kiểu trả về, SET, security definer, kiểm is_active_user() (42501), sort, phân trang của list_inspection_details / count_inspection_details giữ NGUYÊN;
-- chỉ đổi điều kiện p_q. KHÔNG đụng list/count_transport_plans (000018).
--
-- Cách giữ tốc độ (như D-022 cho Nhập phiếu): tìm trước trong lookup_items (~4,5k dòng, GIN norm) và profiles (ít dòng) -> mảng id;
-- rồi lọc bảng lớn bằng `cột_fk = any(mảng)` (index btree FK có sẵn) + ilike trên index trigram -> BitmapOr, không join chuỗi tên trên 470k dòng.
-- Phiếu cha (số lệnh VC, xe, tài xế, NV xuất) cũng thành MẢNG id phiếu (v_plans) rồi `d.plan_id = any(v_plans)`:
--   chọn mảng thay vì semi-join (`d.plan_id in (select ...)`) vì sublink trong OR khiến planner bỏ BitmapOr và quét tuần tự 470k dòng (đã gặp ở 000018);
--   mảng cho phép Bitmap Index Scan trên inspection_details_plan_id_idx. Mỗi nhánh tìm phiếu là một SELECT riêng (UNION) để dùng index riêng của nó.
-- Phần tìm mảng gom vào MỘT hàm nội bộ f_inspection_search_ids dùng chung list + count -> hai hàm không thể lệch nhau.
begin;

-- ---------- 1. Index: GIN trigram partial cho ghi chú / hạng mục (nhỏ: chỉ dòng khác null; note ~20k dòng, work_item hiện rỗng) ----------
-- Các index btree FK của inspection_details đã có từ 000003/000004/000011: construction_id, delivery_unit_id, receiving_unit_id, export_type_id,
-- product_id, unit_id, carrier_id, shipper_id, plan_id, created_by, updated_by (partial) -> không tạo lại.
-- transport_plan_material_exporters(lookup_id) đã có với tên tpme_lookup_id_idx (000002) -> không tạo thêm index trùng.
create index if not exists inspection_details_note_trgm_idx
  on public.inspection_details using gin (note extensions.gin_trgm_ops) where note is not null;
create index if not exists inspection_details_work_item_trgm_idx
  on public.inspection_details using gin (work_item extensions.gin_trgm_ops) where work_item is not null;

-- ---------- 2. Hàm nội bộ: id danh mục / người dùng / phiếu khớp từ khóa ----------
-- p_pat = mẫu ilike đã escape dạng '%q%' (do hàm gọi dựng). Trả null (không phải mảng rỗng) khi không khớp để nhánh bị bỏ khi lập kế hoạch.
-- Chỉ các hàm security definer khác gọi được (revoke khỏi mọi vai trò client).
-- Kind tìm: đúng các cột hiện ở bảng kiểm + phiếu cha: construction, delivery_unit, receiving_unit, export_type, product, unit, carrier,
--   vehicle, driver, fg_exporter, material_exporter (shipper_id thuộc fg/material_exporter). KHÔNG gồm transport_type (Phân loại VC: bảng kiểm không hiển thị).
create or replace function public.f_inspection_search_ids(p_pat text)
returns table (lk bigint[], uids uuid[], plans bigint[])
language plpgsql
stable
security definer
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
declare
  v_np text := public.f_search_norm(p_pat);
  v_lk bigint[];
  v_u uuid[];
  v_p bigint[];
begin
  v_lk := array(
    select i.id from public.lookup_items i
    where i.kind in ('construction', 'delivery_unit', 'receiving_unit', 'export_type', 'product', 'unit', 'carrier',
                     'vehicle', 'driver', 'fg_exporter', 'material_exporter')
      and (public.f_search_norm(i.name) like v_np or public.f_search_norm(i.code) like v_np));

  v_u := array(
    select pr.id from public.profiles pr
    where public.f_search_norm(pr.username) like v_np or public.f_search_norm(pr.full_name) like v_np);

  -- shortcut: nếu v_p > ~20.000 phiếu (từ khóa rất ngắn khớp nhiều danh mục) vẫn đúng nhưng chậm dần; xem ghi chú rủi ro trong api-contract.
  v_p := array(
    select p.id from public.transport_plans p where p.transport_order_no ilike p_pat
    union select p.id from public.transport_plans p where p.vehicle_id = any (v_lk)
    union select p.id from public.transport_plans p where p.driver_id = any (v_lk)
    union select p.id from public.transport_plans p where p.fg_exporter_id = any (v_lk)
    union select m.plan_id from public.transport_plan_material_exporters m where m.lookup_id = any (v_lk));

  return query select
    case when cardinality(v_lk) > 0 then v_lk end,
    case when cardinality(v_u) > 0 then v_u end,
    case when cardinality(v_p) > 0 then v_p end;
end $$;

revoke all on function public.f_inspection_search_ids(text) from public, anon, authenticated;

-- ---------- 3. list_inspection_details ----------
-- p_sort hợp lệ: created_at, export_date, tk_number, warehouse_slip_no, construction_code, construction_name, export_type_name, product_name, quantity, total_weight_kg
-- p_q (từ 000019, D-022): tk_number, warehouse_slip_no, work_item, note (ilike) + tên/mã không dấu của công trình, đơn vị giao/nhận, loại hình xuất, mặt hàng, ĐVT,
--   nhà xe, NV xuất hàng của dòng + số lệnh VC, số xe, tài xế, NV xuất của phiếu cha + username/full_name người tạo/sửa.
create or replace function public.list_inspection_details(
  p_q text default null,
  p_from date default null,
  p_to date default null,
  p_export_type_id bigint default null,
  p_product_id bigint default null,
  p_construction_id bigint default null,
  p_receiving_unit_id bigint default null,
  p_sort text default 'created_at',
  p_desc boolean default true,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id bigint, plan_id bigint, tk_number text, transport_order_no text, export_date date, warehouse_slip_no text,
  construction_id bigint, construction_code text, construction_name text, work_item text,
  delivery_unit_id bigint, delivery_unit_name text, receiving_unit_id bigint, receiving_unit_name text,
  export_type_id bigint, export_type_name text, product_id bigint, product_name text, unit_id bigint, unit_name text,
  quantity numeric, total_weight_kg numeric, shipper_name text, vehicle_name text, driver_name text,
  carrier_id bigint, carrier_name text, note text, created_at timestamptz, updated_at timestamptz,
  shipper_id bigint, plan_shipper_name text, created_by uuid, updated_by uuid,
  created_by_name text, created_by_username text, updated_by_name text, updated_by_username text
)
language plpgsql
stable
security definer
set search_path = ''
set join_collapse_limit = 1
set from_collapse_limit = 1
set plan_cache_mode = force_custom_plan -- tham số null được rút gọn lúc lập kế hoạch; kế hoạch chung sẽ làm mất index trigram
as $$
#variable_conflict use_column
declare
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'created_at');
  v_desc boolean := coalesce(p_desc, true);
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_pat text;
  v_lk bigint[];
  v_su uuid[];
  v_plans bigint[];
  v_ids bigint[];
  v_uids uuid[];
begin
  if not public.is_active_user() then raise exception 'Bạn không có quyền xem dữ liệu' using errcode = '42501'; end if;
  if v_sort not in ('created_at', 'export_date', 'tk_number', 'warehouse_slip_no', 'construction_code', 'construction_name',
                    'export_type_name', 'product_name', 'quantity', 'total_weight_kg') then
    raise exception 'Cột sắp xếp không hợp lệ: %', v_sort using errcode = '22023';
  end if;
  -- escape \ % _ để ilike coi là chữ thường
  if v_q is not null then
    v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    select s.lk, s.uids, s.plans into v_lk, v_su, v_plans from public.f_inspection_search_ids(v_pat) s;
  end if;

  -- Bước 1: lấy id của trang, chỉ trên bảng gốc.
  if v_sort = 'created_at' and v_desc then
    v_ids := array(select d.id from public.inspection_details d
      where (v_pat is null or d.tk_number ilike v_pat or d.warehouse_slip_no ilike v_pat or d.work_item ilike v_pat or d.note ilike v_pat
             or (v_lk is not null and (d.construction_id = any (v_lk) or d.delivery_unit_id = any (v_lk) or d.receiving_unit_id = any (v_lk)
                  or d.export_type_id = any (v_lk) or d.product_id = any (v_lk) or d.unit_id = any (v_lk)
                  or d.carrier_id = any (v_lk) or d.shipper_id = any (v_lk)))
             or (v_plans is not null and d.plan_id = any (v_plans))
             or (v_su is not null and (d.created_by = any (v_su) or d.updated_by = any (v_su))))
        and (p_from is null or d.export_date >= p_from) and (p_to is null or d.export_date <= p_to)
        and (p_export_type_id is null or d.export_type_id = p_export_type_id)
        and (p_product_id is null or d.product_id = p_product_id)
        and (p_construction_id is null or d.construction_id = p_construction_id)
        and (p_receiving_unit_id is null or d.receiving_unit_id = p_receiving_unit_id)
      order by d.created_at desc, d.id desc limit v_limit offset v_offset);
  elsif v_sort = 'created_at' then
    v_ids := array(select d.id from public.inspection_details d
      where (v_pat is null or d.tk_number ilike v_pat or d.warehouse_slip_no ilike v_pat or d.work_item ilike v_pat or d.note ilike v_pat
             or (v_lk is not null and (d.construction_id = any (v_lk) or d.delivery_unit_id = any (v_lk) or d.receiving_unit_id = any (v_lk)
                  or d.export_type_id = any (v_lk) or d.product_id = any (v_lk) or d.unit_id = any (v_lk)
                  or d.carrier_id = any (v_lk) or d.shipper_id = any (v_lk)))
             or (v_plans is not null and d.plan_id = any (v_plans))
             or (v_su is not null and (d.created_by = any (v_su) or d.updated_by = any (v_su))))
        and (p_from is null or d.export_date >= p_from) and (p_to is null or d.export_date <= p_to)
        and (p_export_type_id is null or d.export_type_id = p_export_type_id)
        and (p_product_id is null or d.product_id = p_product_id)
        and (p_construction_id is null or d.construction_id = p_construction_id)
        and (p_receiving_unit_id is null or d.receiving_unit_id = p_receiving_unit_id)
      order by d.created_at asc, d.id asc limit v_limit offset v_offset);
  elsif v_sort = 'export_date' and v_desc then
    v_ids := array(select d.id from public.inspection_details d
      where (v_pat is null or d.tk_number ilike v_pat or d.warehouse_slip_no ilike v_pat or d.work_item ilike v_pat or d.note ilike v_pat
             or (v_lk is not null and (d.construction_id = any (v_lk) or d.delivery_unit_id = any (v_lk) or d.receiving_unit_id = any (v_lk)
                  or d.export_type_id = any (v_lk) or d.product_id = any (v_lk) or d.unit_id = any (v_lk)
                  or d.carrier_id = any (v_lk) or d.shipper_id = any (v_lk)))
             or (v_plans is not null and d.plan_id = any (v_plans))
             or (v_su is not null and (d.created_by = any (v_su) or d.updated_by = any (v_su))))
        and (p_from is null or d.export_date >= p_from) and (p_to is null or d.export_date <= p_to)
        and (p_export_type_id is null or d.export_type_id = p_export_type_id)
        and (p_product_id is null or d.product_id = p_product_id)
        and (p_construction_id is null or d.construction_id = p_construction_id)
        and (p_receiving_unit_id is null or d.receiving_unit_id = p_receiving_unit_id)
      order by d.export_date desc nulls last, d.id desc limit v_limit offset v_offset);
  elsif v_sort = 'export_date' then
    v_ids := array(select d.id from public.inspection_details d
      where (v_pat is null or d.tk_number ilike v_pat or d.warehouse_slip_no ilike v_pat or d.work_item ilike v_pat or d.note ilike v_pat
             or (v_lk is not null and (d.construction_id = any (v_lk) or d.delivery_unit_id = any (v_lk) or d.receiving_unit_id = any (v_lk)
                  or d.export_type_id = any (v_lk) or d.product_id = any (v_lk) or d.unit_id = any (v_lk)
                  or d.carrier_id = any (v_lk) or d.shipper_id = any (v_lk)))
             or (v_plans is not null and d.plan_id = any (v_plans))
             or (v_su is not null and (d.created_by = any (v_su) or d.updated_by = any (v_su))))
        and (p_from is null or d.export_date >= p_from) and (p_to is null or d.export_date <= p_to)
        and (p_export_type_id is null or d.export_type_id = p_export_type_id)
        and (p_product_id is null or d.product_id = p_product_id)
        and (p_construction_id is null or d.construction_id = p_construction_id)
        and (p_receiving_unit_id is null or d.receiving_unit_id = p_receiving_unit_id)
      order by d.export_date asc nulls last, d.id asc limit v_limit offset v_offset);
  else
    -- shortcut: các cột còn lại sắp trong bộ nhớ trên tập đã lọc (top-N), không có index; cột danh mục join thêm 1 danh mục để lấy tên. Cần index riêng nếu dùng nhiều ở hàng triệu dòng.
    v_ids := array(select d.id from public.inspection_details d
      left join lateral (
        select l.code, l.name from public.lookup_items l
        where l.id = case v_sort when 'construction_code' then d.construction_id when 'construction_name' then d.construction_id
                                 when 'export_type_name' then d.export_type_id when 'product_name' then d.product_id end
      ) sl on true
      where (v_pat is null or d.tk_number ilike v_pat or d.warehouse_slip_no ilike v_pat or d.work_item ilike v_pat or d.note ilike v_pat
             or (v_lk is not null and (d.construction_id = any (v_lk) or d.delivery_unit_id = any (v_lk) or d.receiving_unit_id = any (v_lk)
                  or d.export_type_id = any (v_lk) or d.product_id = any (v_lk) or d.unit_id = any (v_lk)
                  or d.carrier_id = any (v_lk) or d.shipper_id = any (v_lk)))
             or (v_plans is not null and d.plan_id = any (v_plans))
             or (v_su is not null and (d.created_by = any (v_su) or d.updated_by = any (v_su))))
        and (p_from is null or d.export_date >= p_from) and (p_to is null or d.export_date <= p_to)
        and (p_export_type_id is null or d.export_type_id = p_export_type_id)
        and (p_product_id is null or d.product_id = p_product_id)
        and (p_construction_id is null or d.construction_id = p_construction_id)
        and (p_receiving_unit_id is null or d.receiving_unit_id = p_receiving_unit_id)
      order by
        case when not v_desc then case v_sort when 'tk_number' then d.tk_number when 'warehouse_slip_no' then d.warehouse_slip_no
                                              when 'construction_code' then sl.code when 'construction_name' then sl.name
                                              when 'export_type_name' then sl.name when 'product_name' then sl.name end end asc nulls last,
        case when v_desc then case v_sort when 'tk_number' then d.tk_number when 'warehouse_slip_no' then d.warehouse_slip_no
                                          when 'construction_code' then sl.code when 'construction_name' then sl.name
                                          when 'export_type_name' then sl.name when 'product_name' then sl.name end end desc nulls last,
        case when not v_desc then case v_sort when 'quantity' then d.quantity when 'total_weight_kg' then d.total_weight_kg end end asc nulls last,
        case when v_desc then case v_sort when 'quantity' then d.quantity when 'total_weight_kg' then d.total_weight_kg end end desc nulls last,
        case when v_desc then d.id end desc nulls last, d.id asc
      limit v_limit offset v_offset);
  end if;

  -- Bước 2: tên người tạo/sửa của các dòng trong trang (một lần gọi).
  select coalesce(array_agg(s.x), '{}') into v_uids
  from (select d.created_by as x from public.inspection_details d where d.id = any (v_ids)
        union select d.updated_by from public.inspection_details d where d.id = any (v_ids)) s
  where s.x is not null;

  -- Bước 3: join danh mục chỉ cho các id đó, giữ thứ tự trang.
  return query
  with nm as materialized (
    select u.id, u.full_name, u.username from public.get_user_names(v_uids) u
  )
  select
    d.id, d.plan_id, d.tk_number, p.transport_order_no, d.export_date, d.warehouse_slip_no,
    d.construction_id, con.code, con.name, d.work_item,
    d.delivery_unit_id, du.name, d.receiving_unit_id, ru.name,
    d.export_type_id, et.name, d.product_id, pr.name, d.unit_id, un.name,
    d.quantity, d.total_weight_kg,
    coalesce(sh.name, fg.name, mx.name), veh.name, drv.name,
    d.carrier_id, ca.name, d.note, d.created_at, d.updated_at,
    d.shipper_id, coalesce(fg.name, mx.name), d.created_by, d.updated_by,
    cu.full_name, cu.username, uu.full_name, uu.username
  from unnest(v_ids) with ordinality as t(rid, n)
  join public.inspection_details d on d.id = t.rid
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
  ) mx on true
  left join nm cu on cu.id = d.created_by
  left join nm uu on uu.id = d.updated_by
  order by t.n;
end $$;

revoke all on function public.list_inspection_details(text, date, date, bigint, bigint, bigint, bigint, text, boolean, int, int) from public, anon;
grant execute on function public.list_inspection_details(text, date, date, bigint, bigint, bigint, bigint, text, boolean, int, int) to authenticated;

-- ---------- 4. count_inspection_details ----------
-- WHERE giống hệt bước 1 của list_inspection_details (cùng v_pat, cùng f_inspection_search_ids), trừ construction/receiving_unit (hợp đồng chỉ có 5 tham số).
create or replace function public.count_inspection_details(
  p_q text default null,
  p_from date default null,
  p_to date default null,
  p_export_type_id bigint default null,
  p_product_id bigint default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
set plan_cache_mode = force_custom_plan -- như list_*: giữ index trigram khi tham số null
as $$
#variable_conflict use_column
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_pat text;
  v_lk bigint[];
  v_su uuid[];
  v_plans bigint[];
  v_n bigint;
begin
  if not public.is_active_user() then raise exception 'Bạn không có quyền xem dữ liệu' using errcode = '42501'; end if;
  if v_q is not null then
    v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    select s.lk, s.uids, s.plans into v_lk, v_su, v_plans from public.f_inspection_search_ids(v_pat) s;
  end if;
  select count(*) into v_n from public.inspection_details d
  where (v_pat is null or d.tk_number ilike v_pat or d.warehouse_slip_no ilike v_pat or d.work_item ilike v_pat or d.note ilike v_pat
         or (v_lk is not null and (d.construction_id = any (v_lk) or d.delivery_unit_id = any (v_lk) or d.receiving_unit_id = any (v_lk)
              or d.export_type_id = any (v_lk) or d.product_id = any (v_lk) or d.unit_id = any (v_lk)
              or d.carrier_id = any (v_lk) or d.shipper_id = any (v_lk)))
         or (v_plans is not null and d.plan_id = any (v_plans))
         or (v_su is not null and (d.created_by = any (v_su) or d.updated_by = any (v_su))))
    and (p_from is null or d.export_date >= p_from) and (p_to is null or d.export_date <= p_to)
    and (p_export_type_id is null or d.export_type_id = p_export_type_id)
    and (p_product_id is null or d.product_id = p_product_id);
  return v_n;
end $$;

revoke all on function public.count_inspection_details(text, date, date, bigint, bigint) from public, anon;
grant execute on function public.count_inspection_details(text, date, date, bigint, bigint) to authenticated;

-- ---------- 5. Kiểm tra ----------
do $$
declare
  f text;
  c text;
begin
  foreach f in array array[
    'public.list_inspection_details(text,date,date,bigint,bigint,bigint,bigint,text,boolean,integer,integer)',
    'public.count_inspection_details(text,date,date,bigint,bigint)'
  ] loop
    assert to_regprocedure(f) is not null, 'thiếu hàm ' || f;
    assert (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(f)::oid), f || ' phải là security definer';
    assert (select coalesce('search_path=""' = any (p.proconfig), false) from pg_proc p where p.oid = to_regprocedure(f)::oid), f || ' phải có search_path rỗng';
    assert pg_get_functiondef(to_regprocedure(f)) like '%is_active_user%', f || ' phải kiểm is_active_user()';
    assert pg_get_functiondef(to_regprocedure(f)) like '%f_inspection_search_ids%', f || ' phải dùng f_inspection_search_ids';
    assert has_function_privilege('authenticated', f, 'execute'), 'authenticated phải gọi được ' || f;
    assert not has_function_privilege('anon', f, 'execute'), 'anon không được gọi ' || f;
  end loop;

  f := 'public.f_inspection_search_ids(text)';
  assert to_regprocedure(f) is not null, 'thiếu hàm ' || f;
  assert (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(f)::oid), f || ' phải là security definer';
  assert (select coalesce('search_path=""' = any (p.proconfig), false) from pg_proc p where p.oid = to_regprocedure(f)::oid), f || ' phải có search_path rỗng';
  assert not has_function_privilege('authenticated', f, 'execute'), 'authenticated không được gọi trực tiếp ' || f;
  assert not has_function_privilege('anon', f, 'execute'), 'anon không được gọi ' || f;

  assert exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'inspection_details_note_trgm_idx'), 'thiếu inspection_details_note_trgm_idx';
  assert exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'inspection_details_work_item_trgm_idx'), 'thiếu inspection_details_work_item_trgm_idx';
  assert exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'transport_plan_material_exporters'
                 and indexdef like '%(lookup_id)%'), 'thiếu index transport_plan_material_exporters(lookup_id)';
  -- mỗi cột lọc của dòng có một index (btree FK hoặc trigram)
  foreach c in array array['construction_id', 'delivery_unit_id', 'receiving_unit_id', 'export_type_id', 'product_id', 'unit_id',
                           'carrier_id', 'shipper_id', 'plan_id', 'created_by', 'updated_by'] loop
    assert exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'inspection_details'
                   and indexdef like '%(' || c || ')%'), 'thiếu index inspection_details(' || c || ')';
  end loop;

  -- Không có người dùng (auth.uid() null) -> 42501. set_config local: hết hiệu lực khi kết thúc transaction.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.count_inspection_details(p_q => 'bao');
    assert false, 'count_inspection_details phải báo 42501 khi chưa đăng nhập';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform 1 from public.list_inspection_details(p_q => 'bao', p_limit => 1);
    assert false, 'list_inspection_details phải báo 42501 khi chưa đăng nhập';
  exception when sqlstate '42501' then null;
  end;
end $$;

commit;

-- ---------- Đo (Lead) sau khi áp + VACUUM ANALYZE public.inspection_details, public.lookup_items, public.transport_plans ----------
-- (VACUUM không chạy được trong migration.) Dưới vai trò thật:
-- set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid user hoạt động>","role":"authenticated"}', true);
--   explain (analyze, buffers) select * from public.list_inspection_details(p_q => 'TK2026/10-4');    -- số TK / số PXK: kỳ vọng vài chục ms
--   explain (analyze, buffers) select * from public.list_inspection_details(p_q => '<một số PXK có thật>');
--   explain (analyze, buffers) select * from public.list_inspection_details(p_q => '<một phần tên mặt hàng, vd "thep">');   -- nhánh danh mục: BitmapOr trên các index FK
--   explain (analyze, buffers) select * from public.list_inspection_details(p_q => '<tên tài xế không dấu, vd "nguyen van">'); -- nhánh phiếu cha: plan_id = any(v_plans)
--   explain (analyze, buffers) select * from public.list_inspection_details(p_q => 'bao');             -- ngắn: khớp nhiều danh mục + người tạo (bao...) -> trường hợp xấu nhất
--   select public.count_inspection_details(p_q => 'bao');   -- phải bằng tổng các trang của list_inspection_details(p_q => 'bao', p_limit => 200, p_offset => ...)
-- Xem riêng phần tìm mảng:  select cardinality(lk), cardinality(uids), cardinality(plans) from public.f_inspection_search_ids('%bao%');   (chạy bằng postgres/service role)
-- Kiểm tra nhanh index được dùng (không qua hàm), trong phiên postgres:
--   explain (analyze, buffers) select count(*) from public.inspection_details where note ilike '%giao hang%';          -- Bitmap Index Scan on inspection_details_note_trgm_idx
-- anon: set local role anon; select public.count_inspection_details();  -> permission denied.
