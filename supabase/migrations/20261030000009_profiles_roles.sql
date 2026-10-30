-- T-034 / D-013: người dùng & phân quyền (thay D-003). Bảng profiles, hàm is_admin()/is_active_user(), RLS theo vai trò
-- và theo người tạo (sửa/xóa phiếu & dòng bảng kiểm: người tạo trong 24 giờ, hoặc admin).
-- Viết để chạy lại được khi dán vào SQL Editor: if not exists / or replace / drop if exists / on conflict do nothing.
-- Phụ thuộc: public.set_updated_at() (000001), public.f_search_norm(text) (000008, bỏ dấu), view 000008.
begin;

-- ---------- 1. Bảng profiles ----------
-- Chỉ Edge Function admin-users (service role, bỏ qua RLS) được ghi; authenticated chỉ đọc.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null constraint profiles_username_format_check check (username ~ '^[a-z0-9]+(\.[a-z0-9]+)*$'),
  full_name text not null check (full_name = btrim(full_name) and full_name <> ''),
  role text not null default 'user' check (role in ('admin', 'user')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_username_lower_uq on public.profiles (lower(username));

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

-- ---------- 2. Hàm kiểm tra vai trò / quyền sửa ----------
-- security definer: đọc profiles/transport_plans bỏ qua RLS (tránh đệ quy khi dùng trong chính policy).
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active) $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active and p.role = 'admin') $$;

-- Được sửa/xóa một dòng: admin, hoặc người tạo trong 24 giờ kể từ created_at.
create or replace function public.can_edit_row(p_created_by uuid, p_created_at timestamptz)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_admin()
      or coalesce(public.is_active_user()
                  and p_created_by = (select auth.uid())
                  and p_created_at > now() - interval '24 hours', false)
$$;

-- Được sửa phiếu cha (dùng cho bảng nối NV xuất VT).
create or replace function public.can_edit_plan(p_plan_id bigint)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.transport_plans p
                 where p.id = p_plan_id and public.can_edit_row(p.created_by, p.created_at))
$$;

revoke all on function public.is_active_user(), public.is_admin(), public.can_edit_row(uuid, timestamptz),
  public.can_edit_plan(bigint) from public, anon;
grant execute on function public.is_active_user(), public.is_admin(), public.can_edit_row(uuid, timestamptz),
  public.can_edit_plan(bigint) to authenticated;

-- policy của profiles (cần hàm ở trên)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

-- ---------- 3. Backfill từ auth.users ----------
do $$
declare
  r record;
  base text;
  cand text;
  n int;
begin
  for r in select u.id, u.email from auth.users u
           where not exists (select 1 from public.profiles p where p.id = u.id)
           order by u.created_at, u.id
  loop
    -- phần trước @, bỏ dấu, chỉ giữ [a-z0-9.], gộp/cắt dấu chấm thừa
    base := regexp_replace(regexp_replace(regexp_replace(
              public.f_search_norm(split_part(coalesce(r.email, ''), '@', 1)),
              '[^a-z0-9.]', '', 'g'), '\.{2,}', '.', 'g'), '^\.+|\.+$', '', 'g');
    if base = '' then base := 'user'; end if;
    cand := base;
    n := 1;
    while exists (select 1 from public.profiles where lower(username) = cand) loop
      n := n + 1;
      cand := base || n;
    end loop;
    insert into public.profiles (id, username, full_name, role)
    values (r.id, cand,
            coalesce(nullif(btrim(split_part(coalesce(r.email, ''), '@', 1)), ''), cand),
            case when lower(r.email) = 'thaibao06061997@gmail.com' then 'admin' else 'user' end)
    on conflict (id) do nothing;
  end loop;
end $$;

-- chủ hệ thống luôn là admin đang hoạt động (kể cả khi profile có sẵn)
update public.profiles p set role = 'admin', is_active = true
from auth.users u
where u.id = p.id and lower(u.email) = 'thaibao06061997@gmail.com' and (p.role <> 'admin' or not p.is_active);

-- ---------- 4. Chống giả mạo người tạo ----------
-- Có auth.uid() (người dùng qua API): created_by/created_at do DB đặt và không sửa được.
-- auth.uid() null (SQL Editor / postgres / service role): cho đặt tay (gán chủ sở hữu dữ liệu đã nạp).
create or replace function public.guard_owner_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
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

drop trigger if exists transport_plans_guard_owner_ins on public.transport_plans;
drop trigger if exists transport_plans_guard_owner_upd on public.transport_plans;
create trigger transport_plans_guard_owner_ins before insert on public.transport_plans
  for each row execute function public.guard_owner_fields();
create trigger transport_plans_guard_owner_upd before update on public.transport_plans
  for each row execute function public.guard_owner_fields();

drop trigger if exists inspection_details_guard_owner_ins on public.inspection_details;
drop trigger if exists inspection_details_guard_owner_upd on public.inspection_details;
create trigger inspection_details_guard_owner_ins before insert on public.inspection_details
  for each row execute function public.guard_owner_fields();
create trigger inspection_details_guard_owner_upd before update on public.inspection_details
  for each row execute function public.guard_owner_fields();

-- ---------- 5. RLS các bảng nghiệp vụ ----------
-- Danh mục: user xem + thêm (ô "+ Thêm"); sửa/xóa chỉ admin.
drop policy if exists lookup_items_select on public.lookup_items;
drop policy if exists lookup_items_insert on public.lookup_items;
drop policy if exists lookup_items_update on public.lookup_items;
drop policy if exists lookup_items_delete on public.lookup_items;
create policy lookup_items_select on public.lookup_items for select to authenticated using ((select public.is_active_user()));
create policy lookup_items_insert on public.lookup_items for insert to authenticated with check ((select public.is_active_user()));
create policy lookup_items_update on public.lookup_items for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy lookup_items_delete on public.lookup_items for delete to authenticated using ((select public.is_admin()));

-- Phiếu và dòng bảng kiểm: xem/thêm mọi user hoạt động (kể cả thêm dòng vào phiếu của người khác);
-- sửa/xóa: admin hoặc người tạo trong 24 giờ.
drop policy if exists transport_plans_select on public.transport_plans;
drop policy if exists transport_plans_insert on public.transport_plans;
drop policy if exists transport_plans_update on public.transport_plans;
drop policy if exists transport_plans_delete on public.transport_plans;
create policy transport_plans_select on public.transport_plans for select to authenticated using ((select public.is_active_user()));
create policy transport_plans_insert on public.transport_plans for insert to authenticated with check ((select public.is_active_user()));
create policy transport_plans_update on public.transport_plans for update to authenticated
  using (public.can_edit_row(created_by, created_at)) with check (public.can_edit_row(created_by, created_at));
create policy transport_plans_delete on public.transport_plans for delete to authenticated
  using (public.can_edit_row(created_by, created_at));

drop policy if exists inspection_details_select on public.inspection_details;
drop policy if exists inspection_details_insert on public.inspection_details;
drop policy if exists inspection_details_update on public.inspection_details;
drop policy if exists inspection_details_delete on public.inspection_details;
create policy inspection_details_select on public.inspection_details for select to authenticated using ((select public.is_active_user()));
create policy inspection_details_insert on public.inspection_details for insert to authenticated with check ((select public.is_active_user()));
create policy inspection_details_update on public.inspection_details for update to authenticated
  using (public.can_edit_row(created_by, created_at)) with check (public.can_edit_row(created_by, created_at));
create policy inspection_details_delete on public.inspection_details for delete to authenticated
  using (public.can_edit_row(created_by, created_at));

-- Bảng nối NV xuất VT: ghi chỉ khi được sửa phiếu cha (create_transport_plan: người tạo vừa tạo; update_transport_plan:
-- người tạo trong 24 giờ / admin).
drop policy if exists tpme_select on public.transport_plan_material_exporters;
drop policy if exists tpme_insert on public.transport_plan_material_exporters;
drop policy if exists tpme_update on public.transport_plan_material_exporters;
drop policy if exists tpme_delete on public.transport_plan_material_exporters;
create policy tpme_select on public.transport_plan_material_exporters for select to authenticated using ((select public.is_active_user()));
create policy tpme_insert on public.transport_plan_material_exporters for insert to authenticated with check (public.can_edit_plan(plan_id));
create policy tpme_update on public.transport_plan_material_exporters for update to authenticated
  using (public.can_edit_plan(plan_id)) with check (public.can_edit_plan(plan_id));
create policy tpme_delete on public.transport_plan_material_exporters for delete to authenticated using (public.can_edit_plan(plan_id));

-- inspection_daily_stats (vẫn chỉ đọc)
drop policy if exists inspection_daily_stats_select on public.inspection_daily_stats;
create policy inspection_daily_stats_select on public.inspection_daily_stats
  for select to authenticated using ((select public.is_active_user()));

-- import_plans / import_details (nếu còn): giữ nguyên, RLS bật, không policy.

-- ---------- 6. RPC update_transport_plan: chỉ đổi thông báo lỗi ----------
-- Không có quyền (hoặc không có phiếu) -> update 0 dòng -> P0002. Chữ ký, quyền hàm giữ nguyên (security invoker).
create or replace function public.update_transport_plan(
  p_id bigint, p_export_date date, p_transport_order_no text, p_transport_type_id bigint, p_vehicle_id bigint,
  p_driver_id bigint, p_fg_exporter_id bigint, p_material_exporter_ids bigint[], p_note text)
returns public.transport_plans language plpgsql set search_path = '' as $$
declare
  v_row public.transport_plans;
begin
  update public.transport_plans set
    export_date = p_export_date,
    transport_order_no = nullif(btrim(p_transport_order_no), ''),
    transport_type_id = p_transport_type_id,
    vehicle_id = p_vehicle_id,
    driver_id = p_driver_id,
    fg_exporter_id = p_fg_exporter_id,
    note = nullif(btrim(p_note), '')
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Không tìm thấy phiếu hoặc bạn không có quyền sửa (chỉ người tạo trong 24 giờ hoặc admin)' using errcode = 'P0002';
  end if;

  delete from public.transport_plan_material_exporters where plan_id = p_id;
  insert into public.transport_plan_material_exporters (plan_id, lookup_id, sort_order)
  select p_id, s.x, (row_number() over (order by s.o) - 1)::int
  from (select t.x, min(t.o) as o
        from unnest(coalesce(p_material_exporter_ids, '{}')) with ordinality as t(x, o)
        where t.x is not null group by t.x) s;

  return v_row;
end $$;

revoke execute on function public.update_transport_plan(bigint,date,text,bigint,bigint,bigint,bigint,bigint[],text) from public, anon;
grant execute on function public.update_transport_plan(bigint,date,text,bigint,bigint,bigint,bigint,bigint[],text) to authenticated;

-- ---------- 7. View: y nguyên 000008, thêm created_by ở CUỐI ----------
create or replace view public.inspection_details_view with (security_invoker = true) as
select
  d.id,
  d.plan_id,
  d.tk_number,
  p.transport_order_no,
  d.export_date,
  d.warehouse_slip_no,
  d.construction_id,
  con.code as construction_code,
  con.name as construction_name,
  d.work_item,
  d.delivery_unit_id,
  du.name as delivery_unit_name,
  d.receiving_unit_id,
  ru.name as receiving_unit_name,
  d.export_type_id,
  et.name as export_type_name,
  d.product_id,
  pr.name as product_name,
  d.unit_id,
  un.name as unit_name,
  d.quantity,
  d.total_weight_kg,
  coalesce(sh.name, fg.name, mx.name) as shipper_name,  -- người được chọn cho dòng; trống thì theo phiếu (TP/BTP, rồi NV xuất VT đầu tiên)
  veh.name as vehicle_name,
  drv.name as driver_name,
  d.carrier_id,
  ca.name as carrier_name,
  d.note,
  d.created_at,
  d.updated_at,
  d.shipper_id,
  coalesce(fg.name, mx.name) as plan_shipper_name,
  d.created_by
from public.inspection_details d
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
) mx on true;

revoke all on public.inspection_details_view from anon;
grant select on public.inspection_details_view to authenticated;

-- ---------- 8. Kiểm tra ----------
do $$
declare t text; f text;
begin
  assert exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = 'profiles' and c.relrowsecurity), 'profiles chưa bật RLS';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'profiles') = 1, 'profiles: phải có đúng 1 policy (select)';
  assert not has_table_privilege('anon', 'public.profiles', 'select'), 'anon không được đọc profiles';
  assert not has_table_privilege('authenticated', 'public.profiles', 'insert')
     and not has_table_privilege('authenticated', 'public.profiles', 'update')
     and not has_table_privilege('authenticated', 'public.profiles', 'delete'), 'authenticated không được ghi profiles';
  foreach f in array array['public.is_admin()', 'public.is_active_user()', 'public.can_edit_row(uuid,timestamptz)', 'public.can_edit_plan(bigint)'] loop
    assert to_regprocedure(f) is not null, 'thiếu hàm ' || f;
    assert has_function_privilege('authenticated', f, 'execute'), 'authenticated phải gọi được ' || f;
    assert not has_function_privilege('anon', f, 'execute'), 'anon không được gọi ' || f;
  end loop;
  assert not exists (select 1 from auth.users u where lower(u.email) = 'thaibao06061997@gmail.com')
      or exists (select 1 from public.profiles p join auth.users u on u.id = p.id
                 where lower(u.email) = 'thaibao06061997@gmail.com' and p.role = 'admin' and p.is_active), 'thaibao06061997@gmail.com chưa là admin';
  assert not exists (select 1 from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)), 'còn tài khoản chưa có profile';

  -- phiếu & dòng bảng kiểm: update/delete dùng can_edit_row
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename in ('transport_plans', 'inspection_details')
            and cmd in ('UPDATE', 'DELETE') and (coalesce(qual, '') || coalesce(with_check, '')) like '%can_edit_row%') = 4, 'update/delete phải dùng can_edit_row';
  -- bảng nối: insert/update/delete dùng can_edit_plan
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'transport_plan_material_exporters'
            and cmd in ('INSERT', 'UPDATE', 'DELETE') and (coalesce(qual, '') || coalesce(with_check, '')) like '%can_edit_plan%') = 3, 'tpme phải dùng can_edit_plan';
  -- danh mục: update/delete admin
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'lookup_items'
            and cmd in ('UPDATE', 'DELETE') and (coalesce(qual, '') || coalesce(with_check, '')) like '%is_admin%') = 2, 'lookup_items update/delete phải là admin';
  -- không còn policy nghiệp vụ nào chỉ kiểm "đã đăng nhập"
  assert not exists (select 1 from pg_policies where schemaname = 'public'
                       and tablename in ('lookup_items', 'transport_plans', 'transport_plan_material_exporters', 'inspection_details', 'inspection_daily_stats')
                       and (coalesce(qual, '') || coalesce(with_check, '')) !~ '(is_active_user|is_admin|can_edit_row|can_edit_plan)'), 'còn policy cũ';
  foreach t in array array['lookup_items', 'transport_plans', 'transport_plan_material_exporters', 'inspection_details'] loop
    assert (select count(*) from pg_policies where schemaname = 'public' and tablename = t) = 4, t || ': phải có 4 policy';
  end loop;

  -- trigger chống giả mạo
  assert (select count(*) from pg_trigger where not tgisinternal and tgname in (
            'transport_plans_guard_owner_ins', 'transport_plans_guard_owner_upd',
            'inspection_details_guard_owner_ins', 'inspection_details_guard_owner_upd')) = 4, 'thiếu trigger guard_owner';
  -- view có created_by
  assert exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'inspection_details_view' and column_name = 'created_by'), 'view thiếu created_by';
  perform 1 from public.inspection_details_view limit 1;
end $$;

commit;
