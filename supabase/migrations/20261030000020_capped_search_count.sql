-- T-062 / D-022: đếm có trần khi có từ khóa tìm (p_q) cho count_transport_plans và count_inspection_details. Chạy lại được (create or replace).
-- Lý do: ở 470k dòng, từ khóa khớp rất nhiều dòng ('thep' ~189k, 'bao' ~toàn bộ phiếu) đếm chính xác mất 0,8-7 s; đếm có trần
--   `select count(*) from (select 1 ... limit 10001) x` mất ~80 ms.
-- Hợp đồng mới: có p_q -> trả TỐI ĐA 10001 (10001 nghĩa là "hơn 10.000 dòng"); không có p_q -> đếm chính xác như cũ.
-- Chữ ký, kiểu trả về, SET, security definer, kiểm is_active_user() (42501), cách tính mảng và điều kiện WHERE giữ NGUYÊN so với 000018 / 000019.
-- Chỉ đổi câu đếm cuối. KHÔNG đụng list_*, f_inspection_search_ids.
begin;

-- ---------- 1. count_transport_plans (gốc: 000018) ----------
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
  if v_q is not null then
    -- có từ khóa: đếm có trần 10001 (10001 = hơn 10.000 dòng)
    select count(*) into v_n from (
      select 1 from public.transport_plans p
      where (v_pat is null or p.tk_number ilike v_pat or p.transport_order_no ilike v_pat or p.note ilike v_pat
             or (cardinality(v_lk) > 0 and (p.transport_type_id = any (v_lk) or p.vehicle_id = any (v_lk)
                                            or p.driver_id = any (v_lk) or p.fg_exporter_id = any (v_lk)))
             or (cardinality(v_pids) > 0 and p.id = any (v_pids))
             or (cardinality(v_qu) > 0 and (p.created_by = any (v_qu) or p.updated_by = any (v_qu))))
        and (p_from is null or p.export_date >= p_from) and (p_to is null or p.export_date <= p_to)
      limit 10001) x;
  else
    select count(*) into v_n from public.transport_plans p
    where (v_pat is null or p.tk_number ilike v_pat or p.transport_order_no ilike v_pat or p.note ilike v_pat
           or (cardinality(v_lk) > 0 and (p.transport_type_id = any (v_lk) or p.vehicle_id = any (v_lk)
                                          or p.driver_id = any (v_lk) or p.fg_exporter_id = any (v_lk)))
           or (cardinality(v_pids) > 0 and p.id = any (v_pids))
           or (cardinality(v_qu) > 0 and (p.created_by = any (v_qu) or p.updated_by = any (v_qu))))
      and (p_from is null or p.export_date >= p_from) and (p_to is null or p.export_date <= p_to);
  end if;
  return v_n;
end $$;

revoke all on function public.count_transport_plans(text, date, date) from public, anon;
grant execute on function public.count_transport_plans(text, date, date) to authenticated;

-- ---------- 2. count_inspection_details (gốc: 000019) ----------
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
  if v_q is not null then
    -- có từ khóa: đếm có trần 10001 (10001 = hơn 10.000 dòng)
    select count(*) into v_n from (
      select 1 from public.inspection_details d
      where (v_pat is null or d.tk_number ilike v_pat or d.warehouse_slip_no ilike v_pat or d.work_item ilike v_pat or d.note ilike v_pat
             or (v_lk is not null and (d.construction_id = any (v_lk) or d.delivery_unit_id = any (v_lk) or d.receiving_unit_id = any (v_lk)
                  or d.export_type_id = any (v_lk) or d.product_id = any (v_lk) or d.unit_id = any (v_lk)
                  or d.carrier_id = any (v_lk) or d.shipper_id = any (v_lk)))
             or (v_plans is not null and d.plan_id = any (v_plans))
             or (v_su is not null and (d.created_by = any (v_su) or d.updated_by = any (v_su))))
        and (p_from is null or d.export_date >= p_from) and (p_to is null or d.export_date <= p_to)
        and (p_export_type_id is null or d.export_type_id = p_export_type_id)
        and (p_product_id is null or d.product_id = p_product_id)
      limit 10001) x;
  else
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
  end if;
  return v_n;
end $$;

revoke all on function public.count_inspection_details(text, date, date, bigint, bigint) from public, anon;
grant execute on function public.count_inspection_details(text, date, date, bigint, bigint) to authenticated;

-- ---------- 3. Kiểm tra ----------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.count_transport_plans(text,date,date)',
    'public.count_inspection_details(text,date,date,bigint,bigint)'
  ] loop
    assert to_regprocedure(f) is not null, 'thiếu hàm ' || f;
    assert (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(f)::oid), f || ' phải là security definer';
    assert (select coalesce('search_path=""' = any (p.proconfig), false) from pg_proc p where p.oid = to_regprocedure(f)::oid), f || ' phải có search_path rỗng';
    assert pg_get_functiondef(to_regprocedure(f)) like '%is_active_user%', f || ' phải kiểm is_active_user()';
    assert pg_get_functiondef(to_regprocedure(f)) like '%limit 10001%', f || ' phải đếm có trần (limit 10001)';
    assert has_function_privilege('authenticated', f, 'execute'), 'authenticated phải gọi được ' || f;
    assert not has_function_privilege('anon', f, 'execute'), 'anon không được gọi ' || f;
  end loop;

  -- Không có người dùng (auth.uid() null) -> 42501. set_config local: hết hiệu lực khi kết thúc transaction.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.count_transport_plans(p_q => 'bao');
    assert false, 'count_transport_plans phải báo 42501 khi chưa đăng nhập';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.count_inspection_details(p_q => 'bao');
    assert false, 'count_inspection_details phải báo 42501 khi chưa đăng nhập';
  exception when sqlstate '42501' then null;
  end;
end $$;

commit;

-- ---------- Đo (Lead) sau khi áp, dưới vai trò thật ----------
-- set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid user hoạt động>","role":"authenticated"}', true);
--   select public.count_inspection_details(p_q => 'thep');   -- kỳ vọng 10001, ~80 ms
--   select public.count_transport_plans(p_q => 'bao');       -- kỳ vọng 10001, ~80 ms
--   select public.count_inspection_details(p_q => '<số PXK có thật>');  -- đúng số dòng (nhỏ hơn 10001)
--   select public.count_inspection_details();                -- không p_q: đếm chính xác như cũ
