-- D-013: gán chủ sở hữu (created_by) cho dữ liệu đã nạp = tài khoản bao.lt.
-- Chạy SAU khi (1) migration 20261030000009 đã áp, (2) admin đã tạo tài khoản bao.lt qua Edge Function admin-users.
-- Chạy trong SQL Editor (auth.uid() null nên trigger chống giả mạo cho phép đặt tay). Chạy lại được.
-- Gồm: phiếu có created_by null, phiếu TK2026/10-001, và mọi dòng bảng kiểm có import_ref (dữ liệu nạp).

-- Kiểm trước (xem kết quả, rồi chạy khối giao dịch bên dưới)
select 'phiếu created_by null' as muc, count(*) as so_dong from public.transport_plans where created_by is null
union all select 'phiếu TK2026/10-001', count(*) from public.transport_plans where tk_number = 'TK2026/10-001'
union all select 'dòng kiểm import_ref', count(*) from public.inspection_details where import_ref is not null
union all select 'dòng kiểm import_ref chưa thuộc bao.lt', count(*) from public.inspection_details d
  where d.import_ref is not null and d.created_by is distinct from (select id from public.profiles where username = 'bao.lt');

begin;

do $$
declare
  v_id uuid := (select id from public.profiles where username = 'bao.lt');
  v_plans bigint;
  v_details bigint;
begin
  if v_id is null then
    raise exception 'Chưa có tài khoản bao.lt - hãy tạo qua Quản lý người dùng (họ tên "Lê Thái Bão") trước';
  end if;

  update public.transport_plans set created_by = v_id
  where (created_by is null or tk_number = 'TK2026/10-001') and created_by is distinct from v_id;
  get diagnostics v_plans = row_count;

  update public.inspection_details set created_by = v_id
  where import_ref is not null and created_by is distinct from v_id;
  get diagnostics v_details = row_count;

  raise notice 'Đã gán bao.lt: % phiếu, % dòng bảng kiểm', v_plans, v_details;

  assert not exists (select 1 from public.transport_plans where created_by is null), 'còn phiếu chưa có chủ';
  assert not exists (select 1 from public.inspection_details where import_ref is not null and created_by is distinct from v_id), 'còn dòng nạp chưa gán';
end $$;

commit;

-- Kiểm sau
select p.username, count(*) as so_phieu
from public.transport_plans t left join public.profiles p on p.id = t.created_by
group by p.username order by 2 desc;
select p.username, count(*) as so_dong_kiem
from public.inspection_details d left join public.profiles p on p.id = d.created_by
group by p.username order by 2 desc;
