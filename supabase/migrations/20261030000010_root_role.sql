-- T-036 / D-014: vai trò root (root > admin > user). Chạy lại được (idempotent). Phụ thuộc 000009.
-- Admin có quyền dữ liệu như root nên is_admin() trả true cho cả admin và root: mọi policy đang dùng
-- is_admin()/can_edit_row()/can_edit_plan() tự áp dụng cho root. Quản lý tài khoản do Edge Function admin-users kiểm.
begin;

-- ---------- 1. role cho phép 'root', tối đa 1 root ----------
do $$
declare c text;
begin
  -- tên check do Postgres tự sinh (thường profiles_role_check): tra theo định nghĩa
  for c in select con.conname from pg_constraint con
           where con.conrelid = 'public.profiles'::regclass and con.contype = 'c'
             and pg_get_constraintdef(con.oid) like '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c);
  end loop;
  alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'user', 'root'));
end $$;

-- ---------- 2. Chủ hệ thống = root (không đổi bao.lt) ----------
update public.profiles p set role = 'root', is_active = true
from auth.users u
where u.id = p.id and lower(u.email) = 'thaibao06061997@gmail.com' and (p.role <> 'root' or not p.is_active);

create unique index if not exists profiles_single_root_uq on public.profiles ((true)) where role = 'root';

-- ---------- 3. Hàm vai trò ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active and p.role in ('admin', 'root')) $$;

create or replace function public.is_root()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active and p.role = 'root') $$;

revoke all on function public.is_root() from public, anon;
grant execute on function public.is_root() to authenticated;

-- ---------- 4. profiles: root thấy tất cả; admin chỉ thấy user + chính mình ----------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_root()) or ((select public.is_admin()) and role = 'user'));

-- ---------- 5. Kiểm tra ----------
do $$
begin
  assert (select count(*) from public.profiles where role = 'root') = 1, 'phải có đúng 1 root';
  assert exists (select 1 from public.profiles p join auth.users u on u.id = p.id
                 where p.role = 'root' and p.is_active and lower(u.email) = 'thaibao06061997@gmail.com'), 'root phải là thaibao06061997@gmail.com';
  assert to_regprocedure('public.is_root()') is not null, 'thiếu is_root()';
  assert has_function_privilege('authenticated', 'public.is_root()', 'execute')
     and not has_function_privilege('anon', 'public.is_root()', 'execute'), 'quyền gọi is_root() sai';
  assert exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'c'
                 and pg_get_constraintdef(oid) like '%root%'), 'check role chưa có root';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'profiles') = 1, 'profiles: phải có đúng 1 policy';
end $$;

commit;
