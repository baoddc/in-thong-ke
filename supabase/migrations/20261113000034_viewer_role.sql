-- Vai trò "viewer" (Chỉ xem): đăng nhập, xem/in/xuất như người dùng thường nhưng KHÔNG thêm/sửa/xóa gì.
-- Chạy lại được (idempotent). Phụ thuộc 000009/000010 (profiles, is_admin), 000013 (tk_reservations), 000014 (edit_requests).
-- Cách làm: policy RESTRICTIVE (AND với policy cũ) trên 4 bảng nghiệp vụ + trigger chặn ở 2 bảng chỉ ghi qua RPC security definer.
-- Không sửa policy/hàm cũ nên không ảnh hưởng quyền của user/admin/root.
begin;

-- ---------- 1. role cho phép 'viewer' ----------
do $$
declare c text;
begin
  for c in select con.conname from pg_constraint con
           where con.conrelid = 'public.profiles'::regclass and con.contype = 'c'
             and pg_get_constraintdef(con.oid) like '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c);
  end loop;
  alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'user', 'root', 'viewer'));
end $$;

-- ---------- 2. is_viewer() ----------
create or replace function public.is_viewer()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active and p.role = 'viewer') $$;

revoke all on function public.is_viewer() from public, anon;
grant execute on function public.is_viewer() to authenticated;

-- ---------- 3. Policy restrictive: viewer không ghi được 4 bảng nghiệp vụ ----------
do $$
declare t text;
begin
  foreach t in array array['lookup_items', 'transport_plans', 'transport_plan_material_exporters', 'inspection_details'] loop
    execute format('drop policy if exists %I on public.%I', t || '_viewer_no_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_viewer_no_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_viewer_no_delete', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (not (select public.is_viewer()))', t || '_viewer_no_insert', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (not (select public.is_viewer())) with check (not (select public.is_viewer()))', t || '_viewer_no_update', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (not (select public.is_viewer()))', t || '_viewer_no_delete', t);
  end loop;
end $$;

-- ---------- 4. Trigger: giữ số phiếu TK, yêu cầu sửa (ghi qua RPC security definer, RLS không áp) ----------
create or replace function public.block_viewer_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_viewer() then
    raise exception 'Tài khoản chỉ xem không được thực hiện thao tác này' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.block_viewer_write() from public, anon, authenticated;

drop trigger if exists tk_reservations_block_viewer on public.tk_reservations;
create trigger tk_reservations_block_viewer before insert or update on public.tk_reservations
  for each row execute function public.block_viewer_write();

drop trigger if exists edit_requests_block_viewer on public.edit_requests;
create trigger edit_requests_block_viewer before insert on public.edit_requests
  for each row execute function public.block_viewer_write();

-- ---------- 5. Kiểm tra ----------
do $$
declare t text;
begin
  assert exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'c'
                 and pg_get_constraintdef(oid) like '%viewer%'), 'check role chưa có viewer';
  assert to_regprocedure('public.is_viewer()') is not null, 'thiếu is_viewer()';
  assert has_function_privilege('authenticated', 'public.is_viewer()', 'execute')
     and not has_function_privilege('anon', 'public.is_viewer()', 'execute'), 'quyền gọi is_viewer() sai';
  foreach t in array array['lookup_items', 'transport_plans', 'transport_plan_material_exporters', 'inspection_details'] loop
    assert (select count(*) from pg_policies where schemaname = 'public' and tablename = t
              and permissive = 'RESTRICTIVE' and policyname like '%viewer_no%') = 3, t || ': thiếu policy chặn viewer';
  end loop;
  assert (select count(*) from pg_trigger where not tgisinternal
            and tgname in ('tk_reservations_block_viewer', 'edit_requests_block_viewer')) = 2, 'thiếu trigger chặn viewer';
end $$;

commit;
