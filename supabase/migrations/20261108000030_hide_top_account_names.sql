-- T-100: giữ kín tài khoản cấp cao nhất với mọi người dùng (người dùng chốt 08/11/2026).
-- get_user_names là nguồn tên người tạo/sửa trong danh sách Nhập phiếu, Bảng kiểm và tên người yêu cầu sửa:
-- người gọi không phải tài khoản cấp cao nhất thì KHÔNG nhận tên của tài khoản đó (giao diện để trống thay vì lộ tên).
-- Chạy lại được (idempotent). Chỉ đổi thân hàm: quyền gọi giữ nguyên.
begin;

create or replace function public.get_user_names(p_ids uuid[])
returns table (id uuid, full_name text, username text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name, p.username
  from public.profiles p
  where (select public.is_active_user()) and p.id = any (p_ids[1:500])
    and (p.role <> 'root' or (select public.is_root()))
$$;

do $$
begin
  assert has_function_privilege('authenticated', 'public.get_user_names(uuid[])', 'execute')
     and not has_function_privilege('anon', 'public.get_user_names(uuid[])', 'execute'), 'quyền gọi get_user_names sai';
  assert pg_get_functiondef('public.get_user_names(uuid[])'::regprocedure) like '%is_root()%', 'get_user_names chưa ẩn tài khoản cấp cao nhất';
end $$;

commit;
