-- T-099: ảnh đại diện. Ảnh lưu ở Supabase Storage (bucket công khai 'avatars', đường dẫn <user_id>/<mili-giây>.webp|jpg);
-- profiles.avatar_path trỏ tới ảnh hiện tại. Mỗi lần đổi là một đường dẫn mới → trình duyệt tự bỏ bộ nhớ đệm ảnh cũ.
-- CHỈ CHỦ TÀI KHOẢN được đổi/gỡ ảnh của chính mình — admin và root cũng không can thiệp được (cả Storage lẫn hàm set_avatar).
-- Chạy lại được (idempotent). Chỉ thêm: không sửa/xóa dữ liệu cũ.
begin;

-- ---------- 1. Cột + ràng buộc đường dẫn ----------
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles drop constraint if exists profiles_avatar_path_chk;
alter table public.profiles add constraint profiles_avatar_path_chk
  check (avatar_path is null or avatar_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{10,16}\.(webp|jpg)$');

-- ---------- 2. Bucket: công khai để đọc ảnh, tối đa 200 KB/ảnh, chỉ webp/jpeg (web đã thu nhỏ 256x256 trước khi tải) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 204800, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------- 3. Quyền ghi: chỉ vào thư mục của chính mình; không có UPDATE (không ghi đè) ----------
drop policy if exists avatars_select on storage.objects;
drop policy if exists avatars_insert on storage.objects;
drop policy if exists avatars_delete on storage.objects;
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars');
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (select public.is_active_user())
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (select public.is_active_user())
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- 4. Gắn ảnh vào hồ sơ của CHÍNH MÌNH (profiles không cho ghi trực tiếp nên đi qua hàm này; p_path = null: gỡ ảnh) ----------
-- Bản đầu có tham số "đổi cho ai" (p_user) cho admin đổi ảnh người khác: BỎ (quy tắc chốt 08/11/2026: chỉ chủ tài khoản). create or replace không xóa hàm khác tham số nên phải drop.
drop function if exists public.set_avatar(uuid, text);

create or replace function public.set_avatar(p_path text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null or not public.is_active_user() then
    raise exception 'Bạn không có quyền thực hiện thao tác này' using errcode = '42501';
  end if;
  if p_path is not null and split_part(p_path, '/', 1) <> v_me::text then
    raise exception 'Đường dẫn ảnh không hợp lệ' using errcode = '22023';
  end if;
  update public.profiles set avatar_path = p_path where id = v_me;
end $$;

revoke all on function public.set_avatar(text) from public, anon;
grant execute on function public.set_avatar(text) to authenticated;

-- ---------- 5. Kiểm tra ----------
do $$
begin
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_path'), 'thiếu profiles.avatar_path';
  assert exists (select 1 from storage.buckets where id = 'avatars' and public and file_size_limit = 204800), 'thiếu bucket avatars';
  assert (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in ('avatars_select', 'avatars_insert', 'avatars_delete')) = 3, 'thiếu policy avatars';
  assert not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in ('avatars_insert', 'avatars_delete') and (qual ilike '%is_admin%' or with_check ilike '%is_admin%')), 'policy avatars không được cho admin can thiệp';
  assert (select count(*) from pg_proc where proname = 'set_avatar' and pronamespace = 'public'::regnamespace) = 1, 'chỉ được có một hàm set_avatar (chỉ chủ tài khoản)';
  assert has_function_privilege('authenticated', 'public.set_avatar(text)', 'execute')
     and not has_function_privilege('anon', 'public.set_avatar(text)', 'execute'), 'quyền gọi set_avatar sai';
end $$;

commit;
