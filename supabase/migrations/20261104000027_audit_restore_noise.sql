-- T-087 / D-032: khôi phục không sinh thêm dòng nhật ký 'update'/'delete' phụ (dòng 'restore' đã ghi đủ),
-- nên không còn nút "Khôi phục" trên chính lần khôi phục (người dùng báo 04/11/2026).
-- Dọn các dòng phụ đã lỡ ghi: cùng giao dịch (cùng `at`), cùng người, cùng bản ghi với một dòng 'restore'.
-- Chạy lại được. Phụ thuộc 000025, 000026.
begin;

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
  if coalesce(current_setting('app.audit_restoring', true), '') = 'on' then return pass; end if; -- restore_audit tự ghi dòng 'restore'
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

-- NV xuất VT: cũng bỏ qua khi đang khôi phục
create or replace function public.audit_tpme_before()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.audit_restoring', true), '') = 'on' then return null; end if;
  if (select id from public.audit_actor()) is null then return null; end if;
  perform set_config('app.audit_tpme_old',
    coalesce((select jsonb_object_agg(plan_id, ids)::text
              from (select plan_id, jsonb_agg(lookup_id order by sort_order, lookup_id) as ids from old_rows group by plan_id) x), '{}'),
    true);
  return null;
end $$;
revoke all on function public.audit_tpme_before() from public, anon, authenticated;

-- Dọn dòng phụ đã ghi bởi các lần khôi phục trước (migration chạy bằng postgres, không qua API)
delete from public.audit_log x
where x.action in ('update', 'delete', 'insert')
  and exists (select 1 from public.audit_log r
              where r.action = 'restore' and r.at = x.at and r.actor_id = x.actor_id
                and r.table_name = x.table_name and r.row_id = x.row_id);

commit;
