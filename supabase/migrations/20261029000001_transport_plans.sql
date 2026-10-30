-- T-001: danh mục nhập tay + phiếu kế hoạch vận chuyển (số phiếu TK do DB sinh). Xem D-003, D-004, D-005.

-- ---------- Trigger dùng chung ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Số phiếu không được đổi sau khi cấp (sửa phiếu không đổi số - D-004)
create or replace function public.lock_tk_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.tk_number is distinct from old.tk_number
     or new.tk_year is distinct from old.tk_year
     or new.tk_month is distinct from old.tk_month
     or new.tk_seq is distinct from old.tk_seq then
    raise exception 'Không được đổi số phiếu thống kê đã cấp' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------- Bảng ----------
create table public.lookup_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('transport_type','vehicle','driver','fg_exporter','material_exporter')),
  name text not null check (name = btrim(name) and name <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index lookup_items_kind_name_uq on public.lookup_items (kind, lower(name));
create trigger lookup_items_set_updated_at before update on public.lookup_items
  for each row execute function public.set_updated_at();

create table public.transport_plans (
  id uuid primary key default gen_random_uuid(),
  tk_number text not null unique,
  tk_year int not null,
  tk_month int not null check (tk_month between 1 and 12),
  tk_seq int not null check (tk_seq between 1 and 999),
  export_date date,
  transport_order_no text,
  transport_type_id uuid constraint transport_plans_transport_type_id_fkey references public.lookup_items(id) on delete restrict,
  vehicle_id uuid constraint transport_plans_vehicle_id_fkey references public.lookup_items(id) on delete restrict,
  driver_id uuid constraint transport_plans_driver_id_fkey references public.lookup_items(id) on delete restrict,
  fg_exporter_id uuid constraint transport_plans_fg_exporter_id_fkey references public.lookup_items(id) on delete restrict,
  note text,
  created_by uuid default auth.uid() constraint transport_plans_created_by_fkey references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transport_plans_tk_ym_seq_uq unique (tk_year, tk_month, tk_seq)
);
create index transport_plans_created_at_idx on public.transport_plans (created_at desc);
create index transport_plans_transport_type_id_idx on public.transport_plans (transport_type_id);
create index transport_plans_vehicle_id_idx on public.transport_plans (vehicle_id);
create index transport_plans_driver_id_idx on public.transport_plans (driver_id);
create index transport_plans_fg_exporter_id_idx on public.transport_plans (fg_exporter_id);
create index transport_plans_created_by_idx on public.transport_plans (created_by);
create trigger transport_plans_set_updated_at before update on public.transport_plans
  for each row execute function public.set_updated_at();
create trigger transport_plans_lock_tk before update on public.transport_plans
  for each row execute function public.lock_tk_fields();

-- Bảng nối: khóa chính (plan_id, lookup_id) là đủ, không cần id/updated_at vì dòng chỉ thêm/xóa, không sửa.
create table public.transport_plan_material_exporters (
  plan_id uuid not null constraint tpme_plan_id_fkey references public.transport_plans(id) on delete cascade,
  lookup_id uuid not null constraint tpme_lookup_id_fkey references public.lookup_items(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (plan_id, lookup_id)
);
create index tpme_lookup_id_idx on public.transport_plan_material_exporters (lookup_id);

-- ---------- Hàm sinh số (dùng chung) ----------
create or replace function public.tk_format(p_year int, p_month int, p_seq int)
returns text language sql immutable set search_path = '' as $$
  select format('TK%s/%s-%s', lpad(p_year::text, 4, '0'), lpad(p_month::text, 2, '0'), lpad(p_seq::text, 3, '0'))
$$;

-- Số khuyết nhỏ nhất trong 1..999 của tháng; null nếu hết.
create or replace function public.tk_next_seq(p_year int, p_month int)
returns int language sql stable set search_path = '' as $$
  select s from generate_series(1, 999) s
  where not exists (select 1 from public.transport_plans t
                    where t.tk_year = p_year and t.tk_month = p_month and t.tk_seq = s)
  order by s limit 1
$$;

create or replace function public.next_tk_number()
returns text language plpgsql stable set search_path = '' as $$
declare
  v_now timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
  v_y int := extract(year from v_now)::int;
  v_m int := extract(month from v_now)::int;
  v_seq int := public.tk_next_seq(v_y, v_m);
begin
  if v_seq is null then
    raise exception 'Đã hết số phiếu thống kê trong tháng %/%', v_m, v_y using errcode = 'P0001';
  end if;
  return public.tk_format(v_y, v_m, v_seq);
end $$;

create or replace function public.create_transport_plan(
  p_export_date date, p_transport_order_no text, p_transport_type_id uuid, p_vehicle_id uuid,
  p_driver_id uuid, p_fg_exporter_id uuid, p_material_exporter_ids uuid[], p_note text)
returns public.transport_plans language plpgsql set search_path = '' as $$
declare
  v_now timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
  v_y int := extract(year from v_now)::int;
  v_m int := extract(month from v_now)::int;
  v_seq int;
  v_row public.transport_plans;
begin
  perform pg_advisory_xact_lock(hashtext('tk_number'));
  v_seq := public.tk_next_seq(v_y, v_m);
  if v_seq is null then
    raise exception 'Đã hết số phiếu thống kê trong tháng %/%', v_m, v_y using errcode = 'P0001';
  end if;

  insert into public.transport_plans (tk_number, tk_year, tk_month, tk_seq, export_date, transport_order_no,
    transport_type_id, vehicle_id, driver_id, fg_exporter_id, note)
  values (public.tk_format(v_y, v_m, v_seq), v_y, v_m, v_seq, p_export_date, nullif(btrim(p_transport_order_no), ''),
    p_transport_type_id, p_vehicle_id, p_driver_id, p_fg_exporter_id, nullif(btrim(p_note), ''))
  returning * into v_row;

  insert into public.transport_plan_material_exporters (plan_id, lookup_id)
  select distinct v_row.id, x from unnest(coalesce(p_material_exporter_ids, '{}')) x where x is not null;

  return v_row;
end $$;

create or replace function public.update_transport_plan(
  p_id uuid, p_export_date date, p_transport_order_no text, p_transport_type_id uuid, p_vehicle_id uuid,
  p_driver_id uuid, p_fg_exporter_id uuid, p_material_exporter_ids uuid[], p_note text)
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
    raise exception 'Không tìm thấy phiếu cần sửa' using errcode = 'P0002';
  end if;

  delete from public.transport_plan_material_exporters where plan_id = p_id;
  insert into public.transport_plan_material_exporters (plan_id, lookup_id)
  select distinct p_id, x from unnest(coalesce(p_material_exporter_ids, '{}')) x where x is not null;

  return v_row;
end $$;

-- ---------- Quyền hàm ----------
revoke execute on function public.set_updated_at(), public.lock_tk_fields(),
  public.tk_format(int,int,int), public.tk_next_seq(int,int), public.next_tk_number(),
  public.create_transport_plan(date,text,uuid,uuid,uuid,uuid,uuid[],text),
  public.update_transport_plan(uuid,date,text,uuid,uuid,uuid,uuid,uuid[],text)
  from public, anon;
grant execute on function public.tk_format(int,int,int), public.tk_next_seq(int,int), public.next_tk_number(),
  public.create_transport_plan(date,text,uuid,uuid,uuid,uuid,uuid[],text),
  public.update_transport_plan(uuid,date,text,uuid,uuid,uuid,uuid,uuid[],text)
  to authenticated;

-- ---------- RLS (v1, D-003: mọi authenticated được toàn quyền; anon không gì cả) ----------
revoke all on public.lookup_items, public.transport_plans, public.transport_plan_material_exporters from anon;
grant select, insert, update, delete on public.lookup_items, public.transport_plans,
  public.transport_plan_material_exporters to authenticated;

alter table public.lookup_items enable row level security;
alter table public.transport_plans enable row level security;
alter table public.transport_plan_material_exporters enable row level security;

create policy lookup_items_select on public.lookup_items for select to authenticated using ((select auth.uid()) is not null);
create policy lookup_items_insert on public.lookup_items for insert to authenticated with check ((select auth.uid()) is not null);
create policy lookup_items_update on public.lookup_items for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy lookup_items_delete on public.lookup_items for delete to authenticated using ((select auth.uid()) is not null);

create policy transport_plans_select on public.transport_plans for select to authenticated using ((select auth.uid()) is not null);
create policy transport_plans_insert on public.transport_plans for insert to authenticated with check ((select auth.uid()) is not null);
create policy transport_plans_update on public.transport_plans for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy transport_plans_delete on public.transport_plans for delete to authenticated using ((select auth.uid()) is not null);

create policy tpme_select on public.transport_plan_material_exporters for select to authenticated using ((select auth.uid()) is not null);
create policy tpme_insert on public.transport_plan_material_exporters for insert to authenticated with check ((select auth.uid()) is not null);
create policy tpme_update on public.transport_plan_material_exporters for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy tpme_delete on public.transport_plan_material_exporters for delete to authenticated using ((select auth.uid()) is not null);

-- ---------- Kiểm tra định dạng (không ghi dữ liệu) ----------
do $$
begin
  assert public.tk_format(2026, 10, 5) = 'TK2026/10-005', 'tk_format(2026,10,5)';
  assert public.tk_format(2026, 1, 999) = 'TK2026/01-999', 'tk_format(2026,1,999)';
end $$;
