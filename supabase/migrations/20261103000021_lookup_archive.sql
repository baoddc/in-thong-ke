-- T-077 / D-026: xóa mục danh mục đang được phiếu/dòng dùng → ẩn (archived_at) thay vì báo lỗi.
-- Phiếu cũ vẫn trỏ tới mục đã ẩn nên giữ nguyên tên; ô chọn và tìm kiếm không hiện mục đã ẩn; thêm lại cùng tên tạo mục mới.
-- Chạy lại được (if not exists / or replace). Phụ thuộc 000004 (unique tên), 000009 (is_admin, is_active_user), 000017 (search_lookup_items).
begin;

alter table public.lookup_items add column if not exists archived_at timestamptz;
comment on column public.lookup_items.archived_at is 'Khác null = đã ẩn khỏi danh mục (bị xóa khi đang được dùng); phiếu cũ vẫn hiện tên';

-- Unique tên/mã chỉ áp cho mục chưa ẩn → thêm lại tên đã ẩn được.
create unique index if not exists lookup_items_kind_name_uq_new
  on public.lookup_items (kind, lower(name)) where kind <> 'construction' and archived_at is null;
drop index if exists public.lookup_items_kind_name_uq;
alter index public.lookup_items_kind_name_uq_new rename to lookup_items_kind_name_uq;

create unique index if not exists lookup_items_kind_code_uq_new
  on public.lookup_items (kind, lower(code)) where code is not null and archived_at is null;
drop index if exists public.lookup_items_kind_code_uq;
alter index public.lookup_items_kind_code_uq_new rename to lookup_items_kind_code_uq;

-- Xóa (admin): chưa ai dùng → xóa hẳn; đang được dùng → ẩn. Trả 'deleted' | 'archived' | 'missing'.
create or replace function public.delete_lookup_item(p_id bigint)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ admin được xóa mục danh mục' using errcode = '42501';
  end if;
  begin
    delete from public.lookup_items where id = p_id;
    if not found then return 'missing'; end if;
    return 'deleted';
  exception when foreign_key_violation then
    update public.lookup_items set archived_at = now() where id = p_id;
    return 'archived';
  end;
end $$;
revoke all on function public.delete_lookup_item(bigint) from public, anon;
grant execute on function public.delete_lookup_item(bigint) to authenticated;

-- search_lookup_items: giữ nguyên 000017, chỉ thêm "i.archived_at is null" ở hai nhánh.
create or replace function public.search_lookup_items(p_kind text, p_q text, p_limit int default 20)
returns setof public.lookup_items
language sql stable security definer set search_path = ''
as $$
  with k as (
    select btrim(coalesce(p_q, '')) as q,
           public.f_search_norm(replace(replace(replace(btrim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_')) as e,
           least(greatest(coalesce(p_limit, 20), 1), 50) as n
  )
  select (r.i).*
  from k
  cross join lateral (
    (select i as i, 0 as rk
       from public.lookup_items i
      where (select public.is_active_user()) and k.q = '' and i.kind = p_kind and i.archived_at is null
      order by i.name, i.id
      limit k.n)
    union all
    (select i as i,
            case when public.f_search_norm(i.name) like k.e || '%' or public.f_search_norm(i.code) like k.e || '%' then 0 else 1 end as rk
       from public.lookup_items i
      where (select public.is_active_user()) and k.q <> '' and i.kind = p_kind and i.archived_at is null
        and (public.f_search_norm(i.name) like '%' || k.e || '%' or public.f_search_norm(i.code) like '%' || k.e || '%')
      order by rk, i.name, i.id
      limit k.n)
  ) r
  order by r.rk, (r.i).name, (r.i).id
$$;
revoke all on function public.search_lookup_items(text,text,int) from public, anon;
grant execute on function public.search_lookup_items(text,text,int) to authenticated;

commit;
