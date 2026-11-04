-- T-085 / D-031: nhật ký thao tác của admin/root — chỉ root xem; không ai sửa/xóa được qua API.
-- Ghi tự động bằng trigger (security definer) khi người thao tác là admin hoặc root (đăng nhập web, có auth.uid()):
--   phiếu, dòng bảng kiểm, danh mục: sửa / xóa (danh mục xóa-đang-dùng = 'archive');
--   NV xuất VT của phiếu: chỉ ghi khi danh sách THẬT SỰ đổi (RPC sửa phiếu xóa hết rồi thêm lại);
--   yêu cầu sửa: duyệt / từ chối.
-- Không ghi: thao tác của người dùng thường, thêm mới (trừ NV xuất VT), SQL Editor/lịch (auth.uid() null), quản lý người dùng (Edge Function).
-- Chạy lại được. Phụ thuộc 000010 (is_root), 000014/000015 (edit_requests), 000021 (archived_at).
begin;

-- ---------- 1. Bảng ----------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text,
  actor_role text,
  action text not null check (action in ('update', 'delete', 'insert', 'approve', 'reject', 'archive')),
  table_name text not null,
  row_id bigint,
  label text,
  changes jsonb
);
create index if not exists audit_log_at_idx on public.audit_log (at desc, id desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, at desc);
alter table public.audit_log enable row level security;
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated using ((select public.is_root()));
-- chỉ đọc: không policy insert/update/delete, thu hồi quyền ghi
revoke insert, update, delete, truncate on public.audit_log from public, anon, authenticated;
comment on table public.audit_log is 'D-031: nhật ký thao tác admin/root, chỉ root đọc; ghi bằng trigger, không sửa/xóa qua API';

-- ---------- 2. Người thao tác (null = không ghi) ----------
create or replace function public.audit_actor(out id uuid, out name text, out role text)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(nullif(p.full_name, ''), p.username), p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.role in ('admin', 'root')
$$;
revoke all on function public.audit_actor() from public, anon, authenticated;

create or replace function public.audit_label(p_table text, r jsonb)
returns text language sql stable security definer set search_path = '' as $$
  select case p_table
    when 'transport_plans' then r->>'tk_number'
    when 'inspection_details' then coalesce(r->>'tk_number', '(chưa có số TK)') || coalesce(' · PXK ' || nullif(r->>'warehouse_slip_no', ''), '')
    when 'lookup_items' then (r->>'kind') || ': ' || coalesce(r->>'code' || ' - ', '') || (r->>'name')
    when 'edit_requests' then 'Yêu cầu sửa ' || coalesce(
      (select t.tk_number from public.transport_plans t where t.id = (r->>'plan_id')::bigint),
      (select coalesce(d.tk_number, '') || coalesce(' · PXK ' || d.warehouse_slip_no, '') from public.inspection_details d where d.id = (r->>'detail_id')::bigint),
      '#' || (r->>'id'))
    else null end
$$;
revoke all on function public.audit_label(text, jsonb) from public, anon, authenticated;

-- ---------- 3. Trigger dòng: phiếu, bảng kiểm, danh mục, yêu cầu sửa ----------
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  a record;
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  diff jsonb;
  act text;
begin
  select * into a from public.audit_actor();
  if a.id is null then return null; end if;

  if tg_op = 'DELETE' then
    act := 'delete'; diff := o;
  else
    select jsonb_object_agg(k.key, jsonb_build_array(k.value, n->k.key)) into diff
    from jsonb_each(o) k
    where k.key not in ('updated_at', 'updated_by') and k.value is distinct from n->k.key;
    if diff is null then return null; end if; -- không đổi gì thật
    act := case
      when tg_table_name = 'edit_requests' then
        case when n->>'status' = 'approved' and o->>'status' <> 'approved' then 'approve'
             when n->>'status' = 'rejected' and o->>'status' <> 'rejected' then 'reject' end
      when tg_table_name = 'lookup_items' and diff ? 'archived_at' and n->>'archived_at' is not null then 'archive'
      else 'update' end;
    if act is null then return null; end if; -- yêu cầu sửa: chỉ ghi duyệt / từ chối
  end if;

  insert into public.audit_log (actor_id, actor_name, actor_role, action, table_name, row_id, label, changes)
  values (a.id, a.name, a.role, act, tg_table_name, (coalesce(n, o)->>'id')::bigint,
          public.audit_label(tg_table_name, coalesce(n, o)), diff);
  return null;
end $$;
revoke all on function public.audit_row() from public, anon, authenticated;

drop trigger if exists transport_plans_audit on public.transport_plans;
create trigger transport_plans_audit after update or delete on public.transport_plans
  for each row execute function public.audit_row();
drop trigger if exists inspection_details_audit on public.inspection_details;
create trigger inspection_details_audit after update or delete on public.inspection_details
  for each row execute function public.audit_row();
drop trigger if exists lookup_items_audit on public.lookup_items;
create trigger lookup_items_audit after update or delete on public.lookup_items
  for each row execute function public.audit_row();
drop trigger if exists edit_requests_audit on public.edit_requests;
create trigger edit_requests_audit after update on public.edit_requests
  for each row execute function public.audit_row();

-- ---------- 4. NV xuất VT: so danh sách trước (câu DELETE) và sau (câu INSERT) trong cùng giao dịch ----------
-- Câu DELETE ghi danh sách cũ vào biến giao dịch; câu INSERT ngay sau so với danh sách mới, chỉ ghi phiếu có thay đổi.
-- Tạo phiếu mới (không có câu DELETE trước) không ghi. Xóa cả phiếu thì đã có dòng 'delete' của phiếu.
create or replace function public.audit_tpme_before()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select id from public.audit_actor()) is null then return null; end if;
  perform set_config('app.audit_tpme_old',
    coalesce((select jsonb_object_agg(plan_id, ids)::text
              from (select plan_id, jsonb_agg(lookup_id order by sort_order, lookup_id) as ids from old_rows group by plan_id) x), '{}'),
    true);
  return null;
end $$;

create or replace function public.audit_tpme_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  a record;
  olds jsonb := nullif(current_setting('app.audit_tpme_old', true), '')::jsonb;
  r record;
begin
  if olds is null then return null; end if; -- không có câu DELETE trước = tạo phiếu mới
  perform set_config('app.audit_tpme_old', '', true);
  select * into a from public.audit_actor();
  if a.id is null then return null; end if;
  for r in
    with news as (select plan_id, jsonb_agg(lookup_id order by sort_order, lookup_id) as ids from new_rows group by plan_id),
    keys as (select k::bigint as plan_id from jsonb_object_keys(olds) k union select plan_id from news)
    select k.plan_id, coalesce(olds->(k.plan_id::text), '[]') as o, coalesce(n.ids, '[]') as n
    from keys k left join news n on n.plan_id = k.plan_id
  loop
    continue when r.o = r.n;
    insert into public.audit_log (actor_id, actor_name, actor_role, action, table_name, row_id, label, changes)
    select a.id, a.name, a.role, 'update', 'transport_plans', r.plan_id, t.tk_number,
      jsonb_build_object('material_exporters', jsonb_build_array(
        (select coalesce(jsonb_agg(l.name order by x.ord), '[]') from jsonb_array_elements_text(r.o) with ordinality x(id, ord) join public.lookup_items l on l.id = x.id::bigint),
        (select coalesce(jsonb_agg(l.name order by x.ord), '[]') from jsonb_array_elements_text(r.n) with ordinality x(id, ord) join public.lookup_items l on l.id = x.id::bigint)))
    from public.transport_plans t where t.id = r.plan_id;
  end loop;
  return null;
end $$;
revoke all on function public.audit_tpme_before(), public.audit_tpme_after() from public, anon, authenticated;

drop trigger if exists tpme_audit_del on public.transport_plan_material_exporters;
create trigger tpme_audit_del after delete on public.transport_plan_material_exporters
  referencing old table as old_rows for each statement execute function public.audit_tpme_before();
drop trigger if exists tpme_audit_ins on public.transport_plan_material_exporters;
create trigger tpme_audit_ins after insert on public.transport_plan_material_exporters
  referencing new table as new_rows for each statement execute function public.audit_tpme_after();

-- ---------- Tự kiểm ----------
do $$
begin
  assert (select relrowsecurity from pg_class where oid = 'public.audit_log'::regclass), 'audit_log phải bật RLS';
  assert not has_table_privilege('authenticated', 'public.audit_log', 'INSERT'), 'authenticated không được ghi audit_log';
  assert not has_table_privilege('authenticated', 'public.audit_log', 'DELETE'), 'authenticated không được xóa audit_log';
  assert (select count(*) from pg_trigger where tgname in ('transport_plans_audit', 'inspection_details_audit', 'lookup_items_audit',
          'edit_requests_audit', 'tpme_audit_del', 'tpme_audit_ins')) = 6, 'thiếu trigger nhật ký';
end $$;

commit;
