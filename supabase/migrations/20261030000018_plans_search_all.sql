-- T-059 / D-022: Tìm nhanh trang Nhập phiếu lọc trên mọi cột hiển thị. Chạy lại được (create or replace / if not exists).
-- Phụ thuộc: 000016 (list_/count_transport_plans), 000008 (f_search_norm, GIN trigram lookup_items), 000009 (profiles, is_active_user),
--            000006 (pg_trgm), 000001/000002 (index khóa ngoại transport_plans, tpme_lookup_id_idx), 000011 (transport_plans_updated_by_idx).
-- Chữ ký, kiểu trả về, SET, security definer, kiểm is_active_user(), sort, phân trang, bước 2/3 GIỮ NGUYÊN so với 000016. Chỉ đổi điều kiện tìm (q) và thêm index note.
--
-- Cách giữ tốc độ (D-022): tìm trước (một lần, biến plpgsql) trên bảng nhỏ -> mảng id, rồi lọc phiếu bằng `cột_fk = any(mảng)` trên index btree FK
-- và `ilike` trên index trigram -> toàn bộ OR là BitmapOr, không join chuỗi tên trên bảng 245k dòng.
--   v_lk   : lookup_items (~4.5k) của 5 kind hiện trên phiếu khớp tên/mã không dấu.
--   v_pids : id phiếu có NV xuất VT (transport_plan_material_exporters) thuộc v_lk. Tính thành mảng thay vì `p.id in (select ...)`
--            vì sublink trong OR không chuyển được thành semijoin/BitmapOr -> planner sẽ quét tuần tự cả bảng.
--   v_qu   : profiles khớp username/full_name không dấu (Người tạo/Người sửa).
-- Mảng rỗng: `cardinality(arr) > 0 and ...` được planner rút gọn lúc lập kế hoạch (plan_cache_mode = force_custom_plan) -> nhánh biến mất.
-- Kind dùng (đúng các cột hiện trên phiếu, lookup_items.kind): transport_type (Phân loại VC), vehicle (Số xe), driver (Tài xế),
--   fg_exporter (NV xuất TP/BTP), material_exporter (NV xuất VT). Không tìm Ngày xuất (đã có bộ lọc ngày).
begin;

-- ---------- 1. Index ----------
-- note thưa (nhiều null) nên index partial nhỏ. pg_trgm ở schema extensions (như 000006/000008).
create index if not exists transport_plans_note_trgm_idx
  on public.transport_plans using gin (note extensions.gin_trgm_ops) where note is not null;
-- Đã có sẵn (không tạo trùng): btree transport_type_id/vehicle_id/driver_id/fg_exporter_id/created_by (000001/000002),
-- updated_by (partial where not null, 000011), tpme_lookup_id_idx trên transport_plan_material_exporters(lookup_id) (000002).

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
  v_norm text;
  v_lk bigint[] := '{}';
  v_pids bigint[] := '{}';
  v_qu uuid[] := '{}';
  v_ids bigint[];
  v_uids uuid[];
begin
  if not public.is_active_user() then raise exception 'Bạn không có quyền xem dữ liệu' using errcode = '42501'; end if;
  if v_sort not in ('created_at', 'export_date', 'tk_number', 'transport_order_no') then
    raise exception 'Cột sắp xếp không hợp lệ: %', v_sort using errcode = '22023';
  end if;
  if v_q is not null then
    v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_norm := '%' || public.f_search_norm(replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_')) || '%';
    if v_norm <> '%%' then
      v_lk := array(select l.id from public.lookup_items l
        where l.kind in ('transport_type', 'vehicle', 'driver', 'fg_exporter', 'material_exporter')
          and (public.f_search_norm(l.name) like v_norm or public.f_search_norm(l.code) like v_norm));
      if cardinality(v_lk) > 0 then
        v_pids := array(select distinct m.plan_id from public.transport_plan_material_exporters m where m.lookup_id = any (v_lk));
      end if;
      v_qu := array(select f.id from public.profiles f
        where public.f_search_norm(f.username) like v_norm or public.f_search_norm(f.full_name) like v_norm);
    end if;
  end if;

  if v_sort = 'created_at' and v_desc then
    v_ids := array(select p.id from public.transport_plans p
      where (v_pat is null or p.tk_number ilike v_pat or p.transport_order_no ilike v_pat or p.note ilike v_pat
             or (cardinality(v_lk) > 0 and (p.transport_type_id = any (v_lk) or p.vehicle_id = any (v_lk)
                                            or p.driver_id = any (v_lk) or p.fg_exporter_id = any (v_lk)))
             or (cardinality(v_pids) > 0 and p.id = any (v_pids))
             or (cardinality(v_qu) > 0 and (p.created_by = any (v_qu) or p.updated_by = any (v_qu))))
        and (p_from is null or p.export_date >= p_from) and (p_to is null or p.export_date <= p_to)
      order by p.created_at desc, p.id desc limit v_limit offset v_offset);
  elsif v_sort = 'created_at' then
    v_ids := array(select p.id from public.transport_plans p
      where (v_pat is null or p.tk_number ilike v_pat or p.transport_order_no ilike v_pat or p.note ilike v_pat
             or (cardinality(v_lk) > 0 and (p.transport_type_id = any (v_lk) or p.vehicle_id = any (v_lk)
                                            or p.driver_id = any (v_lk) or p.fg_exporter_id = any (v_lk)))
             or (cardinality(v_pids) > 0 and p.id = any (v_pids))
             or (cardinality(v_qu) > 0 and (p.created_by = any (v_qu) or p.updated_by = any (v_qu))))
        and (p_from is null or p.export_date >= p_from) and (p_to is null or p.export_date <= p_to)
      order by p.created_at asc, p.id asc limit v_limit offset v_offset);
  elsif v_sort = 'export_date' and v_desc then
    v_ids := array(select p.id from public.transport_plans p
      where (v_pat is null or p.tk_number ilike v_pat or p.transport_order_no ilike v_pat or p.note ilike v_pat
             or (cardinality(v_lk) > 0 and (p.transport_type_id = any (v_lk) or p.vehicle_id = any (v_lk)
                                            or p.driver_id = any (v_lk) or p.fg_exporter_id = any (v_lk)))
             or (cardinality(v_pids) > 0 and p.id = any (v_pids))
             or (cardinality(v_qu) > 0 and (p.created_by = any (v_qu) or p.updated_by = any (v_qu))))
        and (p_from is null or p.export_date >= p_from) and (p_to is null or p.export_date <= p_to)
      order by p.export_date desc nulls last, p.id desc limit v_limit offset v_offset);
  elsif v_sort = 'export_date' then
    v_ids := array(select p.id from public.transport_plans p
      where (v_pat is null or p.tk_number ilike v_pat or p.transport_order_no ilike v_pat or p.note ilike v_pat
             or (cardinality(v_lk) > 0 and (p.transport_type_id = any (v_lk) or p.vehicle_id = any (v_lk)
                                            or p.driver_id = any (v_lk) or p.fg_exporter_id = any (v_lk)))
             or (cardinality(v_pids) > 0 and p.id = any (v_pids))
             or (cardinality(v_qu) > 0 and (p.created_by = any (v_qu) or p.updated_by = any (v_qu))))
        and (p_from is null or p.export_date >= p_from) and (p_to is null or p.export_date <= p_to)
      order by p.export_date asc nulls last, p.id asc limit v_limit offset v_offset);
  else
    -- shortcut: tk_number / transport_order_no sắp trong bộ nhớ trên tập đã lọc (vài chục nghìn dòng: vài ms); thêm index nếu bảng lên hàng trăm nghìn.
    v_ids := array(select p.id from public.transport_plans p
      where (v_pat is null or p.tk_number ilike v_pat or p.transport_order_no ilike v_pat or p.note ilike v_pat
             or (cardinality(v_lk) > 0 and (p.transport_type_id = any (v_lk) or p.vehicle_id = any (v_lk)
                                            or p.driver_id = any (v_lk) or p.fg_exporter_id = any (v_lk)))
             or (cardinality(v_pids) > 0 and p.id = any (v_pids))
             or (cardinality(v_qu) > 0 and (p.created_by = any (v_qu) or p.updated_by = any (v_qu))))
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

-- ---------- 3. count_transport_plans ----------
-- WHERE giống hệt bước 1 của list_transport_plans (cùng v_pat/v_lk/v_pids/v_qu).
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
  v_norm text;
  v_lk bigint[] := '{}';
  v_pids bigint[] := '{}';
  v_qu uuid[] := '{}';
  v_n bigint;
begin
  if not public.is_active_user() then raise exception 'Bạn không có quyền xem dữ liệu' using errcode = '42501'; end if;
  if v_q is not null then
    v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_norm := '%' || public.f_search_norm(replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_')) || '%';
    if v_norm <> '%%' then
      v_lk := array(select l.id from public.lookup_items l
        where l.kind in ('transport_type', 'vehicle', 'driver', 'fg_exporter', 'material_exporter')
          and (public.f_search_norm(l.name) like v_norm or public.f_search_norm(l.code) like v_norm));
      if cardinality(v_lk) > 0 then
        v_pids := array(select distinct m.plan_id from public.transport_plan_material_exporters m where m.lookup_id = any (v_lk));
      end if;
      v_qu := array(select f.id from public.profiles f
        where public.f_search_norm(f.username) like v_norm or public.f_search_norm(f.full_name) like v_norm);
    end if;
  end if;
  select count(*) into v_n from public.transport_plans p
  where (v_pat is null or p.tk_number ilike v_pat or p.transport_order_no ilike v_pat or p.note ilike v_pat
         or (cardinality(v_lk) > 0 and (p.transport_type_id = any (v_lk) or p.vehicle_id = any (v_lk)
                                        or p.driver_id = any (v_lk) or p.fg_exporter_id = any (v_lk)))
         or (cardinality(v_pids) > 0 and p.id = any (v_pids))
         or (cardinality(v_qu) > 0 and (p.created_by = any (v_qu) or p.updated_by = any (v_qu))))
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
    'public.list_transport_plans(text,date,date,text,boolean,integer,integer)',
    'public.count_transport_plans(text,date,date)'
  ] loop
    assert to_regprocedure(f) is not null, 'thiếu hàm ' || f;
    assert (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(f)::oid), f || ' phải là security definer';
    assert (select coalesce('search_path=""' = any (p.proconfig), false) from pg_proc p where p.oid = to_regprocedure(f)::oid), f || ' phải có search_path rỗng';
    assert has_function_privilege('authenticated', f, 'execute'), 'authenticated phải gọi được ' || f;
    assert not has_function_privilege('anon', f, 'execute'), 'anon không được gọi ' || f;
  end loop;

  assert to_regclass('public.transport_plans_note_trgm_idx') is not null, 'thiếu index transport_plans_note_trgm_idx';
  assert to_regclass('public.tpme_lookup_id_idx') is not null, 'thiếu index tpme_lookup_id_idx';
  assert to_regclass('public.transport_plans_updated_by_idx') is not null, 'thiếu index transport_plans_updated_by_idx';

  -- Không có người dùng (auth.uid() null) -> 42501. set_config local: hết hiệu lực khi kết thúc transaction.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.count_transport_plans(p_q => 'bao');
    assert false, 'count_transport_plans phải báo 42501 khi chưa đăng nhập';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform 1 from public.list_transport_plans(p_q => 'bao', p_limit => 1);
    assert false, 'list_transport_plans phải báo 42501 khi chưa đăng nhập';
  exception when sqlstate '42501' then null;
  end;
end $$;

commit;

-- ---------- Đo (Lead) sau khi áp + VACUUM ANALYZE public.transport_plans, public.transport_plan_material_exporters (không chạy được trong migration) ----------
-- Dưới vai trò thật: set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid user hoạt động>","role":"authenticated"}', true);
--   explain (analyze, buffers) select * from public.list_transport_plans(p_q => 'TK2026/10-49');          -- số phiếu: kỳ vọng vài chục ms
--   explain (analyze, buffers) select * from public.list_transport_plans(p_q => '<tên tài xế có thật>');   -- khớp driver_id
--   explain (analyze, buffers) select * from public.list_transport_plans(p_q => '<biển số xe có thật>');   -- khớp vehicle_id
--   explain (analyze, buffers) select * from public.list_transport_plans(p_q => 'bao');                    -- lookup + người tạo/sửa + ghi chú, dễ khớp nhiều nhất
--   select public.count_transport_plans(p_q => 'bao');  -- phải bằng số dòng khi duyệt hết list_transport_plans(p_q => 'bao') theo p_offset
-- Lưu ý: explain trên hàm plpgsql chỉ hiện 1 dòng Function Scan; xem kế hoạch bên trong bằng `load 'auto_explain'; set auto_explain.log_min_duration = 0;
--   set auto_explain.log_nested_statements = on; set auto_explain.log_analyze = on;` (hoặc chạy trực tiếp câu select thân hàm với hằng số thay biến).
-- Kỳ vọng: BitmapOr (trigram tk_number/transport_order_no/note + btree FK + pkey cho v_pids); không Seq Scan transport_plans.
