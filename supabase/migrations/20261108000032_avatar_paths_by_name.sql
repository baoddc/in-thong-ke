-- T-103: hiện ảnh đại diện cạnh tên người trong bảng (NV xuất VT…). Tên trong danh mục chỉ là chữ, nên khớp theo họ tên.
-- Trả họ tên + đường dẫn ảnh của người đang hoạt động có ảnh; KHÔNG trả tài khoản cấp cao nhất (giữ kín).
-- Ảnh vốn nằm trong bucket công khai; hàm này chỉ cho biết ảnh của ai. Chạy lại được (idempotent).
begin;

create or replace function public.get_avatar_paths()
returns table (full_name text, avatar_path text)
language sql stable security definer set search_path = ''
as $$
  select p.full_name, p.avatar_path
  from public.profiles p
  where (select public.is_active_user()) and p.avatar_path is not null and p.role <> 'root'
$$;

revoke all on function public.get_avatar_paths() from public, anon;
grant execute on function public.get_avatar_paths() to authenticated;

do $$
begin
  assert has_function_privilege('authenticated', 'public.get_avatar_paths()', 'execute')
     and not has_function_privilege('anon', 'public.get_avatar_paths()', 'execute'), 'quyền gọi get_avatar_paths sai';
end $$;

commit;
