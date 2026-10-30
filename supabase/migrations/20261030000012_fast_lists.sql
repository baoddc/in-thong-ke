-- T-041 / D-017: RPC đọc danh sách nhanh: list_inspection_details, list_transport_plans. Chạy lại được (idempotent). Phụ thuộc 000003, 000008, 000011.
-- Cách làm: (1) lọc + sắp + phân trang TRÊN BẢNG GỐC để lấy đúng p_limit id (index/trigram dùng được);
-- (2) mới join danh mục cho các id đó, theo thứ tự cố định (join_collapse_limit = 1) nên planner gần như không tốn thời gian.
-- SECURITY INVOKER: RLS của bảng gốc/danh mục giữ nguyên. Tên người tạo/sửa lấy qua get_user_names (security definer) vì RLS profiles chặn đọc người khác.
begin;

-- Sắp export_date giảm dần, NULL cuối (đúng thứ tự FE: nullsFirst:false). Index cũ (export_date desc, id desc) là NULLS FIRST nên chỉ phục vụ chiều tăng (quét ngược).
create index if not exists inspection_details_export_date_nl_id_idx on public.inspection_details (export_date desc nulls last, id desc);
create index if not exists transport_plans_export_date_nl_id_idx on public.transport_plans (export_date desc nulls last, id desc);

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
security invoker
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
security invoker
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

-- ---------- 3. Kiểm tra ----------
do $$
declare
  v_s text;
  v_view_names text[];
  v_view_types oid[];
  v_fn_names text[];
  v_fn_types oid[];
begin
  assert to_regprocedure('public.list_inspection_details(text,date,date,bigint,bigint,bigint,bigint,text,boolean,integer,integer)') is not null, 'thiếu list_inspection_details';
  assert to_regprocedure('public.list_transport_plans(text,date,date,text,boolean,integer,integer)') is not null, 'thiếu list_transport_plans';
  assert has_function_privilege('authenticated', 'public.list_inspection_details(text,date,date,bigint,bigint,bigint,bigint,text,boolean,integer,integer)', 'execute')
     and has_function_privilege('authenticated', 'public.list_transport_plans(text,date,date,text,boolean,integer,integer)', 'execute')
     and not has_function_privilege('anon', 'public.list_inspection_details(text,date,date,bigint,bigint,bigint,bigint,text,boolean,integer,integer)', 'execute')
     and not has_function_privilege('anon', 'public.list_transport_plans(text,date,date,text,boolean,integer,integer)', 'execute'), 'quyền gọi sai';

  -- cột trả về của list_inspection_details phải bắt đầu bằng đúng cột (tên + kiểu + thứ tự) của view
  select array_agg(a.attname::text order by a.attnum), array_agg(a.atttypid order by a.attnum) into v_view_names, v_view_types
  from pg_attribute a where a.attrelid = 'public.inspection_details_view'::regclass and a.attnum > 0 and not a.attisdropped;
  select array_agg(u.n order by u.o), array_agg(u.t order by u.o) into v_fn_names, v_fn_types
  from pg_proc p, unnest(p.proargnames, p.proargmodes, p.proallargtypes) with ordinality as u(n, m, t, o)
  where p.oid = 'public.list_inspection_details(text,date,date,bigint,bigint,bigint,bigint,text,boolean,integer,integer)'::regprocedure and u.m = 't';
  assert v_fn_names[1:cardinality(v_view_names)] = v_view_names, 'tên cột list_inspection_details lệch view';
  assert v_fn_types[1:cardinality(v_view_types)] = v_view_types, 'kiểu cột list_inspection_details lệch view';
  assert cardinality(v_fn_names) = cardinality(v_view_names) + 4, 'list_inspection_details phải có thêm đúng 4 cột tên người';

  -- chạy thử mọi giá trị p_sort, hai chiều (chạy dưới quyền người chạy migration: bỏ qua RLS, chấp nhận)
  foreach v_s in array array['created_at', 'export_date', 'tk_number', 'warehouse_slip_no', 'construction_code', 'construction_name',
                             'export_type_name', 'product_name', 'quantity', 'total_weight_kg'] loop
    perform 1 from public.list_inspection_details(p_q => 'a_', p_sort => v_s, p_desc => true, p_limit => 1);
    perform 1 from public.list_inspection_details(p_sort => v_s, p_desc => false, p_limit => 1);
  end loop;
  foreach v_s in array array['created_at', 'export_date', 'tk_number', 'transport_order_no'] loop
    perform 1 from public.list_transport_plans(p_q => 'a%', p_sort => v_s, p_desc => true, p_limit => 1);
    perform 1 from public.list_transport_plans(p_sort => v_s, p_desc => false, p_limit => 1);
  end loop;
  assert (select count(*) from public.list_inspection_details(p_limit => 1000)) <= 200, 'p_limit phải bị chặn ở 200';
  begin
    perform 1 from public.list_transport_plans(p_sort => 'id; drop table x');
    assert false, 'p_sort sai phải báo lỗi';
  exception when sqlstate '22023' then null;
  end;
end $$;

commit;

-- ---------- Đo (Lead): chạy 2 lần, lấy lần 2. Ngưỡng ở ~42.000 dòng: planning < 10 ms, execution < 30 ms ----------
-- Gọi hàm bằng explain chỉ thấy tổng thời gian hàm; để xem kế hoạch từng câu trong hàm dùng auto_explain, hoặc so sánh Execution Time tổng với cũ.
-- (a) Trang đầu mặc định:
--   explain (analyze, buffers) select * from public.list_inspection_details();
-- (b) Tìm nhanh + khoảng ngày + loại hình (kỳ vọng BitmapOr trên 2 index trigram của inspection_details):
--   explain (analyze, buffers) select * from public.list_inspection_details(p_q => 'TK2026/10', p_from => '2026-10-01', p_to => '2026-10-31', p_export_type_id => 1);
-- (c) Sắp theo cột danh mục:
--   explain (analyze, buffers) select * from public.list_inspection_details(p_sort => 'product_name', p_desc => false, p_limit => 50, p_offset => 50);
-- (d) Phiếu:
--   explain (analyze, buffers) select * from public.list_transport_plans(p_q => 'TK2026', p_sort => 'export_date');
-- Đối chiếu số đo cũ: explain (analyze) select * from public.inspection_details_view order by created_at desc, id desc limit 50;  (planning 82-150 ms)
-- Kiểm thử RLS với vai trò thật: set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid user>","role":"authenticated"}', true); rồi gọi (a). anon phải báo permission denied.
