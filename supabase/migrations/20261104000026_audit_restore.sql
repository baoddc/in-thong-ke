-- T-086 / D-032: root khôi phục dữ liệu gốc từ nhật ký (D-031).
--   'update' / 'archive' -> trả các ô về giá trị cũ (NV xuất VT: trả danh sách cũ);
--   'delete' -> tạo lại đúng dòng đã xóa (cùng id, người tạo, giờ tạo; phiếu: kèm NV xuất VT).
-- An toàn: chỉ root; mỗi dòng nhật ký khôi phục một lần; nếu bản ghi đã bị sửa tiếp sau thao tác đó thì từ chối
-- (khôi phục thao tác mới hơn trước). Việc khôi phục được ghi thành dòng nhật ký 'restore'.
-- Kèm sửa 000025: xóa phiếu ghi nhật ký TRƯỚC khi xóa để còn danh sách NV xuất VT (FK cascade xóa chúng trước trigger AFTER).
-- Chạy lại được. Phụ thuộc 000009 (guard_owner_fields), 000025.
begin;

-- ---------- 1. Cột trạng thái khôi phục + hành động 'restore' ----------
alter table public.audit_log add column if not exists restored_at timestamptz;
alter table public.audit_log add column if not exists restored_by_name text;
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('update', 'delete', 'insert', 'approve', 'reject', 'archive', 'restore'));

-- ---------- 2. Ghi nhật ký xóa phiếu trước khi xóa (kèm NV xuất VT) ----------
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  a record;
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  pass record := case when tg_when = 'BEFORE' then old end; -- trigger BEFORE DELETE phải trả old để xóa tiếp
  diff jsonb;
  act text;
begin
  select * into a from public.audit_actor();
  if a.id is null then return pass; end if;

  if tg_op = 'DELETE' then
    act := 'delete'; diff := o;
    if tg_table_name = 'transport_plans' then
      diff := diff || jsonb_build_object('material_exporters', (
        select coalesce(jsonb_agg(l.name order by m.sort_order, m.lookup_id), '[]')
        from public.transport_plan_material_exporters m join public.lookup_items l on l.id = m.lookup_id
        where m.plan_id = old.id));
    end if;
  else
    select jsonb_object_agg(k.key, jsonb_build_array(k.value, n->k.key)) into diff
    from jsonb_each(o) k
    where k.key not in ('updated_at', 'updated_by') and k.value is distinct from n->k.key;
    if diff is null then return pass; end if;
    act := case
      when tg_table_name = 'edit_requests' then
        case when n->>'status' = 'approved' and o->>'status' <> 'approved' then 'approve'
             when n->>'status' = 'rejected' and o->>'status' <> 'rejected' then 'reject' end
      when tg_table_name = 'lookup_items' and diff ? 'archived_at' and n->>'archived_at' is not null then 'archive'
      else 'update' end;
    if act is null then return pass; end if;
  end if;

  insert into public.audit_log (actor_id, actor_name, actor_role, action, table_name, row_id, label, changes)
  values (a.id, a.name, a.role, act, tg_table_name, (coalesce(n, o)->>'id')::bigint,
          public.audit_label(tg_table_name, coalesce(n, o)), diff);
  return pass;
end $$;
revoke all on function public.audit_row() from public, anon, authenticated;

drop trigger if exists transport_plans_audit on public.transport_plans;
create trigger transport_plans_audit after update on public.transport_plans
  for each row execute function public.audit_row();
drop trigger if exists transport_plans_audit_del on public.transport_plans;
create trigger transport_plans_audit_del before delete on public.transport_plans
  for each row execute function public.audit_row();

-- ---------- 3. Khôi phục giữ người tạo / giờ tạo gốc ----------
-- Biến giao dịch app.audit_restoring chỉ restore_audit (security definer) đặt; API không gọi được set_config.
create or replace function public.guard_owner_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is not null and coalesce(current_setting('app.audit_restoring', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.created_by := (select auth.uid());
      new.created_at := now();
    else
      new.created_by := old.created_by;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_owner_fields() from public, anon, authenticated;

-- ---------- 4. restore_audit ----------
create or replace function public.restore_audit(p_id bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare
  l public.audit_log;
  a record;
  t text;
  cur jsonb;
  cols text;
  old_obj jsonb;
  k text;
  names jsonb;
  what text;
begin
  if not public.is_root() then
    raise exception 'Chỉ root được khôi phục dữ liệu' using errcode = '42501';
  end if;
  select * into l from public.audit_log where id = p_id for update;
  if not found then raise exception 'Không tìm thấy dòng nhật ký #%', p_id using errcode = 'P0001'; end if;
  if l.restored_at is not null then raise exception 'Dòng nhật ký này đã được khôi phục lúc %', to_char(l.restored_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY') using errcode = 'P0001'; end if;
  t := l.table_name;
  if l.action not in ('update', 'delete', 'archive') or t not in ('transport_plans', 'inspection_details', 'lookup_items') then
    raise exception 'Thao tác này không khôi phục được' using errcode = 'P0001';
  end if;
  what := case t when 'transport_plans' then 'phiếu' when 'inspection_details' then 'dòng bảng kiểm' else 'mục danh mục' end;
  perform set_config('app.audit_restoring', 'on', true);

  if l.action = 'delete' then
    -- tạo lại đúng dòng cũ (cùng id); bỏ cột phụ không thuộc bảng
    old_obj := l.changes - 'material_exporters';
    begin
      execute format('insert into public.%I overriding system value select * from jsonb_populate_record(null::public.%I, $1)', t, t) using old_obj;
    exception
      when unique_violation then
        raise exception 'Không tạo lại được: đã có % trùng (cùng id, số TK hoặc tên)', what using errcode = 'P0001';
      when foreign_key_violation then
        raise exception 'Không tạo lại được: phiếu hoặc mục danh mục mà dòng này dùng đã bị xóa — khôi phục chúng trước' using errcode = 'P0001';
    end;
    if t = 'transport_plans' and jsonb_typeof(l.changes->'material_exporters') = 'array' then
      insert into public.transport_plan_material_exporters (plan_id, lookup_id, sort_order)
      select l.row_id, p.id, (x.ord - 1)::int
      from jsonb_array_elements_text(l.changes->'material_exporters') with ordinality x(name, ord)
      cross join lateral (select li.id from public.lookup_items li
                          where li.kind in ('material_exporter', 'fg_exporter') and lower(li.name) = lower(x.name)
                          order by (li.kind = 'material_exporter') desc, (li.archived_at is null) desc, li.id limit 1) p
      on conflict do nothing;
    end if;
  else
    execute format('select to_jsonb(r) from public.%I r where r.id = $1', t) into cur using l.row_id;
    if cur is null then
      raise exception 'Không khôi phục được: % này đã bị xóa sau thao tác đó', what using errcode = 'P0001';
    end if;
    -- chỉ khôi phục khi bản ghi vẫn đúng như ngay sau thao tác (không đè lên lần sửa sau)
    for k in select jsonb_object_keys(l.changes) loop
      if k = 'material_exporters' then
        select coalesce(jsonb_agg(li.name order by m.sort_order, m.lookup_id), '[]') into names
        from public.transport_plan_material_exporters m join public.lookup_items li on li.id = m.lookup_id where m.plan_id = l.row_id;
        if names is distinct from l.changes->k->1 then
          raise exception 'Không khôi phục được: NV xuất VT đã bị sửa tiếp sau thao tác này — khôi phục thao tác mới hơn trước' using errcode = 'P0001';
        end if;
      elsif cur->k is distinct from l.changes->k->1 then
        raise exception 'Không khôi phục được: % đã bị sửa tiếp sau thao tác này — khôi phục thao tác mới hơn trước', what using errcode = 'P0001';
      end if;
    end loop;

    select string_agg(format('%I', key), ', '), jsonb_object_agg(key, value->0) into cols, old_obj
    from jsonb_each(l.changes) where key <> 'material_exporters';
    if cols is not null then
      begin
        execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where id = $2',
                       t, cols, cols, t) using old_obj, l.row_id;
      exception
        when unique_violation then
          raise exception 'Không khôi phục được: giá trị cũ trùng với % khác đang dùng', what using errcode = 'P0001';
        when foreign_key_violation then
          raise exception 'Không khôi phục được: mục danh mục cũ đã bị xóa' using errcode = 'P0001';
      end;
    end if;
    if l.changes ? 'material_exporters' then
      delete from public.transport_plan_material_exporters where plan_id = l.row_id;
      insert into public.transport_plan_material_exporters (plan_id, lookup_id, sort_order)
      select l.row_id, p.id, (x.ord - 1)::int
      from jsonb_array_elements_text(l.changes->'material_exporters'->0) with ordinality x(name, ord)
      cross join lateral (select li.id from public.lookup_items li
                          where li.kind in ('material_exporter', 'fg_exporter') and lower(li.name) = lower(x.name)
                          order by (li.kind = 'material_exporter') desc, (li.archived_at is null) desc, li.id limit 1) p
      on conflict do nothing;
    end if;
  end if;

  select * into a from public.audit_actor();
  update public.audit_log set restored_at = now(), restored_by_name = a.name where id = p_id;
  insert into public.audit_log (actor_id, actor_name, actor_role, action, table_name, row_id, label, changes)
  values (a.id, a.name, a.role, 'restore', t, l.row_id, l.label, jsonb_build_object('from_log', p_id));
  perform set_config('app.audit_restoring', '', true);
  return format('Đã khôi phục %s %s', what, coalesce(l.label, '#' || l.row_id));
end $$;
revoke all on function public.restore_audit(bigint) from public, anon;
grant execute on function public.restore_audit(bigint) to authenticated;

do $$
begin
  assert (select count(*) from pg_trigger where tgname in ('transport_plans_audit', 'transport_plans_audit_del')) = 2, 'thiếu trigger nhật ký phiếu';
  assert pg_get_functiondef('public.restore_audit(bigint)'::regprocedure) like '%is_root%', 'restore_audit phải kiểm root';
end $$;

commit;
