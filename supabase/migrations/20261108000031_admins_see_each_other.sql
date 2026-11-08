-- T-101: admin thấy nhau (người dùng chốt 08/11/2026). Trước đây admin chỉ đọc được profiles của người dùng thường + chính mình.
-- Nay admin đọc được cả admin khác. Tài khoản cấp cao nhất vẫn ẩn với mọi người (chỉ chính nó đọc được).
-- Chỉ ĐỌC: admin vẫn không sửa/khóa/đặt lại mật khẩu của admin khác (Edge Function admin-users quyết định).
-- Chạy lại được (idempotent). Phụ thuộc 000010.
begin;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_root()) or ((select public.is_admin()) and role in ('user', 'admin')));

do $$
begin
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'profiles') = 1, 'profiles: phải có đúng 1 policy';
  assert (select qual from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select') like '%''admin''%', 'policy chưa cho admin thấy admin';
  assert (select qual from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select') not like '%''root''%', 'policy không được nhắc/cho xem tài khoản cấp cao nhất';
end $$;

commit;
