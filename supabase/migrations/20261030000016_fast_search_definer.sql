-- T-056 / D-021: Tìm nhanh dùng được index trigram dưới RLS. Chạy lại được (create or replace). Phụ thuộc 000009 (is_active_user), 000012 (list_*), 000011 (get_user_names).
-- Vấn đề: ilike không leakproof nên dưới RLS Postgres không dùng index trigram (quét cả bảng; 2-5 s ở 470k dòng, không RLS 23 ms).
-- Cách làm: list_inspection_details / list_transport_plans chuyển SECURITY DEFINER (thân hàm, chữ ký, kiểu trả về, các SET giữ NGUYÊN so với 000012),
-- đầu hàm kiểm is_active_user() = đúng điều kiện policy select hiện có của transport_plans / inspection_details / lookup_items
-- (cả ba chỉ yêu cầu is_active_user()) -> quyền xem không đổi. Thêm count_inspection_details / count_transport_plans (cùng bộ lọc với list_*).
-- Sau nạp/nhân dữ liệu lớn: chạy VACUUM ANALYZE (dọn pending list của GIN) - không chạy được trong migration (transaction).
begin;

-- ---------- 1. list_inspection_details, list_transport_plans: security definer + kiểm is_active_user() ----------
-- ---------- 1. list_inspection_details ----------
-- p_sort hợp lệ: created_at, export_date, tk_number, warehouse_slip_no, construction_code, construction_name, export_type_name, product_name, quantity, total_weight_kg
-- Cột trả về: đúng cột của inspection_details_view (cùng thứ tự/kiểu) + created_by_name, created_by_username, updated_by_name, updated_by_username.
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
  end if;

  -- Bước 1: lấy id của trang, chỉ trên bảng gốc.
  if v_sort = 'created_at' and v_desc then
    v_ids := array(select d.id from public.inspection_details d
      where (v_pat is null or d.tk_number ilike v_pat or d.warehouse_slip_no ilike v_pat)
        and (p_from is null or d.export_date >= p_from) and (p_to is null or d.export_date <= p_to)
        and (p_export_type_id is null or d.export_type_id = p_export_type_id)
        and (p_product_id is null or d.product_id = p_product_id)
        and (p_construction_id is null or d.construction_id = p_construction_id)
        and (p_receiving_unit_id is null or d.receiving_unit_id = p_receiving_unit_id)
      order by d.created_at desc, d.id desc limit v_limit offset v_offset);
  elsif v_sort = 'created_at' then
    v_ids := array(select d.id from public.inspection_details d
      where (v_pat is null or d.tk_number ilike v_pat or d.warehouse_slip_no ilike v_pat)
        and (p_from is null or d.export_date >= p_from) and (p_to is null or d.export_date <= p_to)
        and (p_export_type_id is null or d.export_type_id = p_export_type_id)
        and (p_product_id is null or d.product_id = p_product_id)
        and (p_construction_id is null or d.construction_id = p_construction_id)
        and (p_receiving_unit_id is null or d.receiving_unit_id = p_receiving_unit_id)
      order by d.created_at asc, d.id asc limit v_limit offset v_offset);
  elsif v_sort = 'export_date' and v_desc then
    v_ids := array(select d.id from public.inspection_details d
      where (v_pat is null or d.tk_number ilike v_pat or d.warehouse_slip_no ilike v_pat)
        and (p_from is null or d.export_date >= p_from) and (p_to is null or d.export_date <= p_to)
        and (p_export_type_id is null or d.export_type_id = p_export_type_id)
        and (p_product_id is null or d.product_id = p_product_id)
        and (p_construction_id is null or d.construction_id = p_construction_id)
        and (p_receiving_unit_id is null or d.receiving_unit_id = p_receiving_unit_id)
      order by d.export_date desc nulls last, d.id desc limit v_limit offset v_offset);
  elsif v_sort = 'export_date' then
    v_ids := array(select d.id from public.inspection_details d
      where (v_pat is null or d.tk_number ilike v_pat or d.warehouse_slip_no ilike v_pat)
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
      where (v_pat is null or d.tk_number ilike v_pat or d.warehouse_slip_no ilike v_pat)
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

-- ---------- 2. list_transport_plans ----------
-- p_sort hợp lệ: created_at, export_date, tk_number, transport_order_no
create or replace function public.list_transport_plans(
  p_q text default null,
  p_from date default null,
  p_to date default null,
  p_sort text default 'created_at',
  p_desc boolean default true,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id bigint, tk_number text, tk_year int, tk_month int, tk_seq int, export_date date, transport_order_no text,
  transport_type_id bigint, transport_type_name text, vehicle_id bigint, vehicle_name text,
  driver_id bigint, driver_name text, fg_exporter_id bigint, fg_exporter_name text,
  material_exporters jsonb, note text,
  created_by uuid, created_by_name text, created_by_username text, created_at timestamptz,
  updated_by uuid, updated_by_name text, updated_by_username text, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
set join_collapse_limit = 1
set from_collapse_limit = 1
set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
declare
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'created_at');
  v_desc boolean := coalesce(p_desc, true);
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_pat text;
  v_ids bigint[];
  v_uids uuid[];
begin
  if not public.is_active_user() then raise exception 'Bạn không có quyền xem dữ liệu' using errcode = '42501'; end if;
  if v_sort not in ('created_at', 'export_date', 'tk_number', 'transport_order_no') then
    raise exception 'Cột sắp xếp không hợp lệ: %', v_sort using errcode = '22023';
  end if;
  if v_q is not null then
    v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  if v_sort = 'created_at' and v_desc then
    v_ids := array(select p.id from public.transport_plans p
      where (v_pat is null or p.tk_number ilike v_pat or p.transport_order_no ilike v_pat)
        and (p_from is null or p.export_date >= p_from) and (p_to is null or p.export_date <= p_to)
      order by p.created_at desc, p.id desc limit v_limit offset v_offset);
  elsif v_sort = 'created_at' then
    v_ids := array(select p.id from public.transport_plans p
      where (v_pat is null or p.tk_number ilike v_pat or p.transport_order_no ilike v_pat)
        and (p_from is null or p.export_date >= p_from) and (p_to is null or p.export_date <= p_to)
      order by p.created_at asc, p.id asc limit v_limit offset v_offset);
  elsif v_sort = 'export_date' and v_desc then
    v_ids := array(select p.id from public.transport_plans p
      where (v_pat is null or p.tk_number ilike v_pat or p.transport_order_no ilike v_pat)
        and (p_from is null or p.export_date >= p_from) and (p_to is null or p.export_date <= p_to)
      order by p.export_date desc nulls last, p.id desc limit v_limit offset v_offset);
  elsif v_sort = 'export_date' then
    v_ids := array(select p.id from public.transport_plans p
      where (v_pat is null or p.tk_number ilike v_pat or p.transport_order_no ilike v_pat)
        and (p_from is null or p.export_date >= p_from) and (p_to is null or p.export_date <= p_to)
      order by p.export_date asc nulls last, p.id asc limit v_limit offset v_offset);
  else
    -- shortcut: tk_number / transport_order_no sắp trong bộ nhớ trên tập đã lọc (vài chục nghìn dòng: vài ms); thêm index nếu bảng lên hàng trăm nghìn.
    v_ids := array(select p.id from public.transport_plans p
      where (v_pat is null or p.tk_number ilike v_pat or p.transport_order_no ilike v_pat)
        and (p_from is null or p.export_date >= p_from) and (p_to is null or p.export_date <= p_to)
      order by
        case when not v_desc then case v_sort when 'tk_number' then p.tk_number when 'transport_order_no' then p.transport_order_no end end asc nulls last,
        case when v_desc then case v_sort when 'tk_number' then p.tk_number when 'transport_order_no' then p.transport_order_no end end desc nulls last,
        case when v_desc then p.id end desc nulls last, p.id asc
      limit v_limit offset v_offset);
  end if;

  select coalesce(array_agg(s.x), '{}') into v_uids
  from (select p.created_by as x from public.transport_plans p where p.id = any (v_ids)
        union select p.updated_by from public.transport_plans p where p.id = any (v_ids)) s
  where s.x is not null;

  return query
  with nm as materialized (
    select u.id, u.full_name, u.username from public.get_user_names(v_uids) u
  )
  select
    p.id, p.tk_number, p.tk_year, p.tk_month, p.tk_seq, p.export_date, p.transport_order_no,
    p.transport_type_id, tt.name, p.vehicle_id, veh.name, p.driver_id, drv.name, p.fg_exporter_id, fg.name,
    mx.arr, p.note,
    p.created_by, cu.full_name, cu.username, p.created_at,
    p.updated_by, uu.full_name, uu.username, p.updated_at
  from unnest(v_ids) with ordinality as t(rid, n)
  join public.transport_plans p on p.id = t.rid
  left join public.lookup_items tt on tt.id = p.transport_type_id
  left join public.lookup_items veh on veh.id = p.vehicle_id
  left join public.lookup_items drv on drv.id = p.driver_id
  left join public.lookup_items fg on fg.id = p.fg_exporter_id
  left join lateral (
    select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'sort_order', m.sort_order)
                              order by m.sort_order, m.lookup_id), '[]'::jsonb) as arr
    from public.transport_plan_material_exporters m
    join public.lookup_items l on l.id = m.lookup_id
    where m.plan_id = p.id
  ) mx on true
  left join nm cu on cu.id = p.created_by
  left join nm uu on uu.id = p.updated_by
  order by t.n;
end $$;

revoke all on function public.list_transport_plans(text, date, date, text, boolean, int, int) from public, anon;
grant execute on function public.list_transport_plans(text, date, date, text, boolean, int, int) to authenticated;

-- ---------- 2. count_inspection_details ----------
-- WHERE giống hệt bước 1 của list_inspection_details (cùng escape v_pat, cùng cột tìm tk_number OR warehouse_slip_no), trừ construction/receiving_unit (hợp đồng chỉ có 5 tham số).
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
  v_n bigint;
begin
  if not public.is_active_user() then raise exception 'Bạn không có quyền xem dữ liệu' using errcode = '42501'; end if;
  if v_q is not null then
    v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  select count(*) into v_n from public.inspection_details d
  where (v_pat is null or d.tk_number ilike v_pat or d.warehouse_slip_no ilike v_pat)
    and (p_from is null or d.export_date >= p_from) and (p_to is null or d.export_date <= p_to)
    and (p_export_type_id is null or d.export_type_id = p_export_type_id)
    and (p_product_id is null or d.product_id = p_product_id);
  return v_n;
end $$;

revoke all on function public.count_inspection_details(text, date, date, bigint, bigint) from public, anon;
grant execute on function public.count_inspection_details(text, date, date, bigint, bigint) to authenticated;

-- ---------- 3. count_transport_plans ----------
-- WHERE giống hệt bước 1 của list_transport_plans (tk_number OR transport_order_no).
create or replace function public.count_transport_plans(
  p_q text default null,
  p_from date default null,
  p_to date default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_pat text;
  v_n bigint;
begin
  if not public.is_active_user() then raise exception 'Bạn không có quyền xem dữ liệu' using errcode = '42501'; end if;
  if v_q is not null then
    v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  select count(*) into v_n from public.transport_plans p
  where (v_pat is null or p.tk_number ilike v_pat or p.transport_order_no ilike v_pat)
    and (p_from is null or p.export_date >= p_from) and (p_to is null or p.export_date <= p_to);
  return v_n;
end $$;

revoke all on function public.count_transport_plans(text, date, date) from public, anon;
grant execute on function public.count_transport_plans(text, date, date) to authenticated;

-- ---------- 4. Kiểm tra ----------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.list_inspection_details(text,date,date,bigint,bigint,bigint,bigint,text,boolean,integer,integer)',
    'public.list_transport_plans(text,date,date,text,boolean,integer,integer)',
    'public.count_inspection_details(text,date,date,bigint,bigint)',
    'public.count_transport_plans(text,date,date)'
  ] loop
    assert to_regprocedure(f) is not null, 'thiếu hàm ' || f;
    assert (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(f)::oid), f || ' phải là security definer';
    assert (select coalesce('search_path=""' = any (p.proconfig), false) from pg_proc p where p.oid = to_regprocedure(f)::oid), f || ' phải có search_path rỗng';
    assert has_function_privilege('authenticated', f, 'execute'), 'authenticated phải gọi được ' || f;
    assert not has_function_privilege('anon', f, 'execute'), 'anon không được gọi ' || f;
  end loop;

  -- Không có người dùng (auth.uid() null) -> 42501. set_config local: hết hiệu lực khi kết thúc transaction.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.count_inspection_details();
    assert false, 'count_inspection_details phải báo 42501 khi chưa đăng nhập';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.count_transport_plans();
    assert false, 'count_transport_plans phải báo 42501 khi chưa đăng nhập';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform 1 from public.list_inspection_details(p_limit => 1);
    assert false, 'list_inspection_details phải báo 42501 khi chưa đăng nhập';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform 1 from public.list_transport_plans(p_limit => 1);
    assert false, 'list_transport_plans phải báo 42501 khi chưa đăng nhập';
  exception when sqlstate '42501' then null;
  end;
end $$;

commit;

-- ---------- Đo (Lead) sau khi áp + VACUUM ANALYZE public.inspection_details, public.transport_plans ----------
-- Dưới vai trò thật: set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid user hoạt động>","role":"authenticated"}', true);
--   explain (analyze, buffers) select * from public.list_inspection_details(p_q => 'TK2026/10');   -- kỳ vọng ~vài chục ms ở 470k dòng
--   select public.count_inspection_details(p_q => 'TK2026/10');
--   select public.count_transport_plans(p_q => 'TK2026');
-- anon: set local role anon; select public.count_transport_plans();  -> permission denied.
