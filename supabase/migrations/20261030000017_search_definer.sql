-- T-058 / D-021: search_plan_numbers, search_lookup_items dùng được index trigram dưới RLS. Chạy lại được (create or replace). Phụ thuộc 000007, 000008 (f_search_norm), 000009 (is_active_user).
-- Vấn đề: ilike/like không leakproof nên dưới RLS Postgres không dùng index trigram (đo 245k phiếu: search_plan_numbers 5.894 ms, không RLS 32 ms; search_lookup_items 373 ms).
-- Cách làm (như 000016): chữ ký, kiểu trả về, thân truy vấn, SET giữ NGUYÊN so với 000007 / 000008; đổi sang SECURITY DEFINER, search_path rỗng,
-- và thêm điều kiện (select public.is_active_user()) vào từng nhánh WHERE = đúng điều kiện policy select của transport_plans / lookup_items (000009)
-- -> quyền xem không đổi. Hành vi khi không hoạt động/chưa đăng nhập: trả 0 dòng (giống RLS trước đây), KHÔNG raise.
-- get_lookup_items không đổi: tra theo khóa chính (id = any), không dùng ilike nên không bị ảnh hưởng; vẫn security invoker.
begin;

-- ---------- 1. search_plan_numbers ----------
create or replace function public.search_plan_numbers(p_q text, p_limit int default 20)
returns table(id bigint, tk_number text, export_date date)
language sql stable security definer set search_path = ''
as $$
  with k as (
    select btrim(coalesce(p_q, '')) as q,
           replace(replace(replace(btrim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_') as e,
           least(greatest(coalesce(p_limit, 20), 1), 50) as n
  )
  select r.id, r.tk_number, r.export_date
  from k
  cross join lateral (
    (select p.id, p.tk_number, p.export_date, p.created_at, 0 as rk
       from public.transport_plans p
      where (select public.is_active_user())
        and char_length(k.q) < 3 and (k.q = '' or p.tk_number ilike k.e || '%')
      order by p.created_at desc, p.id desc
      limit k.n)
    union all
    (select p.id, p.tk_number, p.export_date, p.created_at,
            case when p.tk_number ilike k.e || '%' then 0 else 1 end as rk
       from public.transport_plans p
      where (select public.is_active_user())
        and char_length(k.q) >= 3 and p.tk_number ilike '%' || k.e || '%'
      order by rk, p.created_at desc, p.id desc
      limit k.n)
  ) r
  order by r.rk, r.created_at desc, r.id desc
$$;
revoke all on function public.search_plan_numbers(text,int) from public, anon;
grant execute on function public.search_plan_numbers(text,int) to authenticated;

-- ---------- 2. search_lookup_items ----------
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
      where (select public.is_active_user()) and k.q = '' and i.kind = p_kind
      order by i.name, i.id
      limit k.n)
    union all
    (select i as i,
            case when public.f_search_norm(i.name) like k.e || '%' or public.f_search_norm(i.code) like k.e || '%' then 0 else 1 end as rk
       from public.lookup_items i
      where (select public.is_active_user()) and k.q <> '' and i.kind = p_kind
        and (public.f_search_norm(i.name) like '%' || k.e || '%' or public.f_search_norm(i.code) like '%' || k.e || '%')
      order by rk, i.name, i.id
      limit k.n)
  ) r
  order by r.rk, (r.i).name, (r.i).id
$$;
revoke all on function public.search_lookup_items(text,text,int) from public, anon;
grant execute on function public.search_lookup_items(text,text,int) to authenticated;

-- ---------- 3. Kiểm tra ----------
do $$
declare
  f text;
  n int;
begin
  foreach f in array array[
    'public.search_plan_numbers(text,integer)',
    'public.search_lookup_items(text,text,integer)'
  ] loop
    assert to_regprocedure(f) is not null, 'thiếu hàm ' || f;
    assert (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(f)::oid), f || ' phải là security definer';
    assert (select coalesce('search_path=""' = any (p.proconfig), false) from pg_proc p where p.oid = to_regprocedure(f)::oid), f || ' phải có search_path rỗng';
    assert pg_get_functiondef(to_regprocedure(f)) like '%is_active_user%', f || ' phải kiểm is_active_user()';
    assert has_function_privilege('authenticated', f, 'execute'), 'authenticated phải gọi được ' || f;
    assert not has_function_privilege('anon', f, 'execute'), 'anon không được gọi ' || f;
    assert not has_function_privilege('public', f, 'execute'), 'public không được gọi ' || f;
  end loop;

  -- Không có người dùng (auth.uid() null) -> 0 dòng dù bảng có dữ liệu. set_config local: hết hiệu lực khi kết thúc transaction.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n from public.search_plan_numbers('', 20);
  assert n = 0, 'search_plan_numbers phải trả 0 dòng khi chưa đăng nhập';
  select count(*) into n from public.search_plan_numbers('TK2026', 20);
  assert n = 0, 'search_plan_numbers (từ khóa) phải trả 0 dòng khi chưa đăng nhập';
  select count(*) into n from public.search_lookup_items('product', '', 20);
  assert n = 0, 'search_lookup_items phải trả 0 dòng khi chưa đăng nhập';
  select count(*) into n from public.search_lookup_items('product', 'ab', 20);
  assert n = 0, 'search_lookup_items (từ khóa) phải trả 0 dòng khi chưa đăng nhập';
end $$;

commit;

-- ---------- Đo (Lead) sau khi áp + VACUUM ANALYZE public.transport_plans, public.lookup_items ----------
-- set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid user hoạt động>","role":"authenticated"}', true);
--   explain (analyze, buffers) select * from public.search_plan_numbers('TK2026/10-4', 20);   -- kỳ vọng ~vài chục ms (trước: 5.894 ms)
--   explain (analyze, buffers) select * from public.search_lookup_items('vehicle', 'ab', 20); -- kỳ vọng vài ms (trước: 373 ms)
-- anon: set local role anon; select * from public.search_plan_numbers('x');  -> permission denied.
