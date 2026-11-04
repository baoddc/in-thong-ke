-- T-091: sửa lỗi từ đợt security audit. Chạy lại được. Phụ thuộc 000009 (is_active_user), 000011 (updated_by), 000013 (tk_next_seq),
-- 000024 (guard_blocked), 000025 (audit_log, audit_actor), 000026 (app.audit_restoring), 000027.
-- 1. guard_owner_fields: khôi phục updated_by (bị mất ở 000026).
-- 2. transport_plans: chặn số TK do client tự đặt khi insert trực tiếp.
-- 3. NV xuất VT: nhật ký mọi thay đổi trong một giao dịch (constraint trigger hoãn), bỏ UPDATE bảng nối.
-- 4. Đăng ký: trần "chờ duyệt" nguyên tử trong DB + bảng đếm lần thử theo IP (dùng bởi Edge Function register).
-- 5. Realtime presence:kho: RLS trên realtime.messages.
-- 6. tk_next_seq: chỉ trả số cho tài khoản đang hoạt động.
begin;

-- ---------- 1. guard_owner_fields: như 000011 + nhánh restore của 000026 ----------
-- Có auth.uid() và không đang khôi phục: INSERT -> created_by/created_at do DB đặt, updated_by = null;
-- UPDATE -> giữ created_*, updated_by = người sửa. Cột updated_by có ở cả transport_plans và inspection_details (000011).
create or replace function public.guard_owner_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is not null and coalesce(current_setting('app.audit_restoring', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.created_by := (select auth.uid());
      new.created_at := now();
      new.updated_by := null; -- chưa có sửa
    else
      new.created_by := old.created_by;
      new.created_at := old.created_at;
      new.updated_by := (select auth.uid());
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_owner_fields() from public, anon, authenticated;

-- ---------- 2. Số TK của phiếu mới phải đúng quy tắc (chỉ áp cho người dùng qua API) ----------
-- create_transport_plan (000013) luôn đặt tk_year/tk_month = năm/tháng hiện tại (Asia/Ho_Chi_Minh), tk_seq 1..999 từ tk_next_seq,
-- tk_number = tk_format(...) nên thỏa điều kiện. SQL Editor/import (auth.uid() null) và restore_audit (cờ restoring) không bị chặn.
-- Tên trigger 'transport_plans_check_tk_ins' chạy trước guard_blocked/guard_owner_ins (BEFORE chạy theo thứ tự tên) -> từ chối sớm.
create or replace function public.check_plan_tk_insert()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_now timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
begin
  if (select auth.uid()) is not null and coalesce(current_setting('app.audit_restoring', true), '') <> 'on' then
    if not coalesce(
         new.tk_seq between 1 and 999
         and new.tk_number = public.tk_format(new.tk_year, new.tk_month, new.tk_seq)
         and new.tk_year = extract(year from v_now)::int
         and new.tk_month = extract(month from v_now)::int, false) then
      raise exception 'Số phiếu thống kê không hợp lệ. Hãy tạo phiếu bằng chức năng "Thêm phiếu".' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.check_plan_tk_insert() from public, anon, authenticated;

drop trigger if exists transport_plans_check_tk_ins on public.transport_plans;
create trigger transport_plans_check_tk_ins before insert on public.transport_plans
  for each row execute function public.check_plan_tk_insert();

-- ---------- 3. NV xuất VT: nhật ký theo giao dịch ----------
-- Bỏ cơ chế cũ (cặp câu DELETE -> INSERT của 000025/000027).
drop trigger if exists tpme_audit_del on public.transport_plan_material_exporters;
drop trigger if exists tpme_audit_ins on public.transport_plan_material_exporters;
drop function if exists public.audit_tpme_before();
drop function if exists public.audit_tpme_after();

-- Không đường nào cần UPDATE bảng nối (update_transport_plan xóa rồi thêm; restore_audit cũng vậy).
drop policy if exists tpme_update on public.transport_plan_material_exporters;
revoke update on public.transport_plan_material_exporters from public, anon, authenticated;

-- Biến giao dịch app.tpme_audit = jsonb { "<plan_id>": {"o": [lookup_id...]} | {"skip": true} | {"done": true} }.
-- Dòng đầu tiên chạm vào một phiếu: chụp danh sách HIỆN TẠI (trước khi đổi). Bỏ qua (skip) khi: đang khôi phục, người thao tác
-- không phải admin/root, hoặc phiếu vừa được tạo trong chính giao dịch này (created_at = now(); tạo phiếu không ghi nhật ký).
-- Cờ restoring bị xóa trước COMMIT nên phải quyết định "skip" ngay lúc chụp, không chờ trigger hoãn.
create or replace function public.tpme_audit_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid bigint := case when tg_op = 'DELETE' then old.plan_id else new.plan_id end;
  st jsonb := coalesce(nullif(current_setting('app.tpme_audit', true), '')::jsonb, '{}');
begin
  if not st ? pid::text then
    st := st || jsonb_build_object(pid::text,
      case when coalesce(current_setting('app.audit_restoring', true), '') = 'on'
             or (select id from public.audit_actor()) is null
             or exists (select 1 from public.transport_plans t where t.id = pid and t.created_at = now())
           then jsonb_build_object('skip', true)
           else jsonb_build_object('o', (select coalesce(jsonb_agg(m.lookup_id order by m.sort_order, m.lookup_id), '[]')
                                        from public.transport_plan_material_exporters m where m.plan_id = pid)) end);
    perform set_config('app.tpme_audit', st::text, true);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.tpme_audit_snapshot() from public, anon, authenticated;

-- Chạy ở cuối giao dịch (DEFERRED): mỗi phiếu xử lý đúng một lần; so danh sách đầu/cuối, khác thì ghi một dòng 'update'.
-- Phiếu đã bị xóa (cascade) -> bỏ qua (đã có dòng 'delete' kèm material_exporters).
create or replace function public.tpme_audit_finish()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid bigint := case when tg_op = 'DELETE' then old.plan_id else new.plan_id end;
  st jsonb := coalesce(nullif(current_setting('app.tpme_audit', true), '')::jsonb, '{}');
  ent jsonb := st->(pid::text);
  a record;
  v_tk text;
  v_new jsonb;
begin
  if ent is null or not ent ? 'o' then return null; end if; -- không chụp / skip / đã xử lý
  perform set_config('app.tpme_audit', (st || jsonb_build_object(pid::text, jsonb_build_object('done', true)))::text, true);
  select t.tk_number into v_tk from public.transport_plans t where t.id = pid;
  if not found then return null; end if;
  select * into a from public.audit_actor();
  if a.id is null then return null; end if;
  select coalesce(jsonb_agg(m.lookup_id order by m.sort_order, m.lookup_id), '[]') into v_new
  from public.transport_plan_material_exporters m where m.plan_id = pid;
  if v_new = ent->'o' then return null; end if;
  insert into public.audit_log (actor_id, actor_name, actor_role, action, table_name, row_id, label, changes)
  values (a.id, a.name, a.role, 'update', 'transport_plans', pid, v_tk,
    jsonb_build_object('material_exporters', jsonb_build_array(
      (select coalesce(jsonb_agg(l.name order by x.ord), '[]') from jsonb_array_elements_text(ent->'o') with ordinality x(id, ord) join public.lookup_items l on l.id = x.id::bigint),
      (select coalesce(jsonb_agg(l.name order by x.ord), '[]') from jsonb_array_elements_text(v_new) with ordinality x(id, ord) join public.lookup_items l on l.id = x.id::bigint))));
  return null;
end $$;
revoke all on function public.tpme_audit_finish() from public, anon, authenticated;

drop trigger if exists tpme_audit_a_snapshot on public.transport_plan_material_exporters;
create trigger tpme_audit_a_snapshot before insert or delete on public.transport_plan_material_exporters
  for each row execute function public.tpme_audit_snapshot();
drop trigger if exists tpme_audit_z_finish on public.transport_plan_material_exporters;
create constraint trigger tpme_audit_z_finish after insert or delete on public.transport_plan_material_exporters
  deferrable initially deferred for each row execute function public.tpme_audit_finish();

-- ---------- 4. Đăng ký: trần chờ duyệt nguyên tử + đếm lần thử theo IP ----------
create or replace function public.guard_pending_cap()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_pending then
    perform pg_advisory_xact_lock(hashtext('register_pending'));
    if (select count(*) from public.profiles p where p.is_pending) >= 20 then -- khớp MAX_PENDING của Edge Function register
      raise exception 'Đang có nhiều yêu cầu chờ duyệt, vui lòng liên hệ quản trị viên' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_pending_cap() from public, anon, authenticated;

drop trigger if exists profiles_pending_cap on public.profiles;
create trigger profiles_pending_cap before insert on public.profiles
  for each row execute function public.guard_pending_cap();

-- Chỉ service role (Edge Function) đọc/ghi; RLS bật, không policy.
create table if not exists public.register_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists register_attempts_ip_at_idx on public.register_attempts (ip, at);
alter table public.register_attempts enable row level security;
revoke all on public.register_attempts from public, anon, authenticated;
comment on table public.register_attempts is 'T-091: số lần gọi Edge Function register theo IP (giới hạn 5/giờ); chỉ service role';

-- ---------- 5. Realtime kênh private presence:kho ----------
-- Chủ dự án nên TẮT "Allow public access" trong Dashboard > Realtime > Settings, để kênh public không còn dùng được.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists presence_kho_select on realtime.messages';
    execute 'drop policy if exists presence_kho_insert on realtime.messages';
    execute $p$create policy presence_kho_select on realtime.messages for select to authenticated
      using ((select public.is_active_user()) and (select realtime.topic()) = 'presence:kho')$p$;
    execute $p$create policy presence_kho_insert on realtime.messages for insert to authenticated
      with check ((select public.is_active_user()) and (select realtime.topic()) = 'presence:kho')$p$;
  else
    raise notice 'Không có realtime.messages: bỏ qua policy presence:kho';
  end if;
end $$;

-- ---------- 6. tk_next_seq: chỉ cho tài khoản đang hoạt động (null nếu không) ----------
-- Gọi từ reserve_tk_number (đã kiểm is_active_user), create_transport_plan (RLS insert cũng đòi active), next_tk_number.
-- SQL Editor (auth.uid() null) gọi trực tiếp sẽ nhận null.
create or replace function public.tk_next_seq(p_year int, p_month int)
returns int language sql stable security definer set search_path = '' as $$
  select s from generate_series(1, 999) s
  where (select public.is_active_user())
    and not exists (select 1 from public.transport_plans t
                    where t.tk_year = p_year and t.tk_month = p_month and t.tk_seq = s)
    and not exists (select 1 from public.tk_reservations r
                    where r.tk_year = p_year and r.tk_month = p_month and r.tk_seq = s
                      and r.expires_at > now() and r.user_id is distinct from (select auth.uid()))
  order by s limit 1
$$;
revoke execute on function public.tk_next_seq(int,int) from public, anon;
grant execute on function public.tk_next_seq(int,int) to authenticated;

-- ---------- Tự kiểm ----------
do $$
begin
  assert pg_get_functiondef('public.guard_owner_fields()'::regprocedure) ilike '%updated_by%', 'guard_owner_fields thiếu updated_by';
  assert pg_get_functiondef('public.guard_owner_fields()'::regprocedure) like '%audit_restoring%', 'guard_owner_fields thiếu nhánh restore';
  assert (select count(*) from pg_trigger where tgname in ('transport_plans_guard_owner_ins', 'transport_plans_guard_owner_upd',
          'inspection_details_guard_owner_ins', 'inspection_details_guard_owner_upd') and tgfoid = 'public.guard_owner_fields()'::regprocedure) = 4,
    'guard_owner_fields phải gắn đủ 4 trigger';
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transport_plans' and column_name = 'updated_by'), 'thiếu transport_plans.updated_by';
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'inspection_details' and column_name = 'updated_by'), 'thiếu inspection_details.updated_by';

  assert exists (select 1 from pg_trigger where tgrelid = 'public.transport_plans'::regclass and tgname = 'transport_plans_check_tk_ins' and not tgisinternal), 'thiếu trigger kiểm số TK';

  assert not exists (select 1 from pg_trigger where tgname in ('tpme_audit_del', 'tpme_audit_ins')), 'trigger tpme cũ phải bị xóa';
  assert to_regprocedure('public.audit_tpme_before()') is null and to_regprocedure('public.audit_tpme_after()') is null, 'hàm tpme cũ phải bị xóa';
  assert not has_table_privilege('authenticated', 'public.transport_plan_material_exporters', 'UPDATE'), 'authenticated không được UPDATE bảng nối';
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'transport_plan_material_exporters' and policyname = 'tpme_update'), 'policy tpme_update phải bị xóa';
  assert (select count(*) from pg_trigger where tgrelid = 'public.transport_plan_material_exporters'::regclass
          and tgname in ('tpme_audit_a_snapshot', 'tpme_audit_z_finish') and not tgisinternal) = 2, 'thiếu trigger nhật ký tpme';
  assert (select tgdeferrable and tginitdeferred from pg_trigger where tgname = 'tpme_audit_z_finish'), 'tpme_audit_z_finish phải DEFERRABLE INITIALLY DEFERRED';
  assert not has_function_privilege('authenticated', 'public.tpme_audit_finish()', 'execute'), 'authenticated không được gọi tpme_audit_finish';

  assert exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_pending_cap'), 'thiếu trigger trần chờ duyệt';
  assert (select relrowsecurity from pg_class where oid = 'public.register_attempts'::regclass), 'register_attempts phải bật RLS';
  assert not has_table_privilege('authenticated', 'public.register_attempts', 'SELECT')
     and not has_table_privilege('anon', 'public.register_attempts', 'INSERT'), 'register_attempts không được mở cho API';

  assert to_regclass('realtime.messages') is null
     or (select count(*) from pg_policies where schemaname = 'realtime' and tablename = 'messages'
         and policyname in ('presence_kho_select', 'presence_kho_insert')) = 2, 'thiếu policy presence:kho';

  assert pg_get_functiondef('public.tk_next_seq(int,int)'::regprocedure) like '%is_active_user%', 'tk_next_seq thiếu is_active_user';
  assert (select prosecdef from pg_proc where oid = 'public.tk_next_seq(int,int)'::regprocedure), 'tk_next_seq phải security definer';
  assert has_function_privilege('authenticated', 'public.tk_next_seq(int,int)', 'execute'), 'authenticated phải gọi được tk_next_seq';
end $$;

commit;
