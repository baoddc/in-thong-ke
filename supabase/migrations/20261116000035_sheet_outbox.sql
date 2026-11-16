-- Đồng bộ phiếu thống kê / dòng bảng kiểm sang Google Sheet (hệ thống → Sheet, một chiều): thêm, SỬA và XÓA đều cập nhật theo.
-- Chạy lại được (idempotent). Cách làm: trigger ghi (bảng, id, thao tác) vào hàng đợi sheet_outbox; Edge Function sheets-sync (service role)
-- lấy hàng đợi, tìm dòng trong Sheet theo cột A = id, cập nhật/thêm/xóa đúng dòng đó, lỗi thì trả hàng đợi lại.
-- Không đụng vào bảng nghiệp vụ nên không kích hoạt audit/updated_at. Dữ liệu có sẵn đưa lên Sheet bằng "đồng bộ lại toàn bộ" (full_sync).
begin;

-- ---------- 1. Hàng đợi + khóa chạy ----------
create table if not exists public.sheet_outbox (
  id bigint generated always as identity primary key,
  tbl text not null check (tbl in ('transport_plans', 'inspection_details')),
  row_id bigint not null,
  op text not null default 'upsert' check (op in ('upsert', 'delete')),
  created_at timestamptz not null default now()
);
alter table public.sheet_outbox add column if not exists op text not null default 'upsert' check (op in ('upsert', 'delete'));
alter table public.sheet_outbox enable row level security; -- không có policy: chỉ service role (bỏ qua RLS) đọc/ghi
revoke all on public.sheet_outbox from anon, authenticated;

-- Một hàng duy nhất: hai lần đồng bộ cùng lúc sẽ làm lệch số dòng trong Sheet → chỉ cho một lần chạy tại một thời điểm.
create table if not exists public.sheet_sync_lock (
  id int primary key default 1 check (id = 1),
  locked_until timestamptz not null default 'epoch'
);
insert into public.sheet_sync_lock (id) values (1) on conflict do nothing;
alter table public.sheet_sync_lock enable row level security;
revoke all on public.sheet_sync_lock from anon, authenticated;

-- ---------- 2. Trigger đưa thay đổi vào hàng đợi ----------
create or replace function public.enqueue_sheet_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    insert into public.sheet_outbox (tbl, row_id, op) values (tg_table_name, old.id, 'delete');
    return null;
  end if;
  insert into public.sheet_outbox (tbl, row_id, op) values (tg_table_name, new.id, 'upsert');
  -- sửa phiếu đổi xe/tài xế/NV xuất… hiển thị ở các dòng bảng kiểm của phiếu → cập nhật luôn các dòng đó
  if tg_table_name = 'transport_plans' and tg_op = 'UPDATE' then
    insert into public.sheet_outbox (tbl, row_id, op)
    select 'inspection_details', d.id, 'upsert' from public.inspection_details d where d.plan_id = new.id;
  end if;
  return null;
end $$;
revoke all on function public.enqueue_sheet_row() from public, anon, authenticated;

drop trigger if exists transport_plans_enqueue_sheet on public.transport_plans;
create trigger transport_plans_enqueue_sheet after insert or update or delete on public.transport_plans
  for each row execute function public.enqueue_sheet_row();
drop trigger if exists inspection_details_enqueue_sheet on public.inspection_details;
create trigger inspection_details_enqueue_sheet after insert or update or delete on public.inspection_details
  for each row execute function public.enqueue_sheet_row();

-- ---------- 3. Lấy / trả hàng đợi, khóa (chỉ service role) ----------
-- Lấy tối đa p_limit mục cũ nhất, xóa khỏi hàng đợi trong một câu lệnh (skip locked); mỗi (bảng, id) chỉ trả thao tác mới nhất.
create or replace function public.claim_sheet_rows(p_limit int)
returns table (tbl text, row_id bigint, op text) language sql security definer set search_path = '' as $$
  with c as (select id from public.sheet_outbox order by id limit greatest(p_limit, 1) for update skip locked),
       d as (delete from public.sheet_outbox o using c where o.id = c.id returning o.id, o.tbl, o.row_id, o.op)
  select distinct on (d.tbl, d.row_id) d.tbl, d.row_id, d.op from d order by d.tbl, d.row_id, d.id desc
$$;

-- p_items: mảng [{tbl,row_id,op}] (đúng kết quả của claim_sheet_rows)
create or replace function public.release_sheet_rows(p_items jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.sheet_outbox (tbl, row_id, op)
  select i->>'tbl', (i->>'row_id')::bigint, i->>'op' from jsonb_array_elements(p_items) i
$$;

-- p_force: gia hạn khóa đang giữ (đồng bộ lại toàn bộ chạy nhiều lượt liền nhau, giữ khóa suốt thời gian đó)
create or replace function public.acquire_sheet_lock(p_seconds int, p_force boolean default false)
returns boolean language sql security definer set search_path = '' as $$
  with u as (
    update public.sheet_sync_lock set locked_until = now() + make_interval(secs => p_seconds)
     where id = 1 and (p_force or locked_until < now()) returning 1)
  select exists (select 1 from u)
$$;

create or replace function public.release_sheet_lock()
returns void language sql security definer set search_path = '' as $$
  update public.sheet_sync_lock set locked_until = 'epoch' where id = 1
$$;

-- ---------- 4. Nội dung ghi vào Sheet: cột A = id, tiêu đề + các dòng (đã đổi mã danh mục thành tên) ----------
-- Id không còn trong bảng (đã xóa) thì không có trong rows → Edge Function coi là xóa.
create or replace function public.sheet_payload(p_tbl text, p_ids bigint[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_rows jsonb;
begin
  if p_tbl = 'transport_plans' then
    select coalesce(jsonb_agg(jsonb_build_array(
             p.id, p.tk_number, p.export_date::text, p.transport_order_no, tt.name, veh.name, drv.name, fg.name,
             (select string_agg(l.name, ', ' order by m.sort_order, m.lookup_id)
                from public.transport_plan_material_exporters m join public.lookup_items l on l.id = m.lookup_id where m.plan_id = p.id),
             p.note, pr.full_name, to_char(p.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS')
           ) order by p.id), '[]'::jsonb)
      into v_rows
      from public.transport_plans p
      left join public.lookup_items tt on tt.id = p.transport_type_id
      left join public.lookup_items veh on veh.id = p.vehicle_id
      left join public.lookup_items drv on drv.id = p.driver_id
      left join public.lookup_items fg on fg.id = p.fg_exporter_id
      left join public.profiles pr on pr.id = p.created_by
     where p.id = any (p_ids);
    return jsonb_build_object(
      'headers', jsonb_build_array('ID', 'Số phiếu TK', 'Ngày xuất', 'Số lệnh vận chuyển', 'Phân loại VC', 'Số xe', 'Tên tài xế', 'NV xuất TP/BTP', 'NV xuất VT', 'Ghi chú', 'Người tạo', 'Giờ tạo'),
      'rows', v_rows);
  elsif p_tbl = 'inspection_details' then
    select coalesce(jsonb_agg(jsonb_build_array(
             v.id, v.tk_number, v.export_date::text, v.warehouse_slip_no, v.construction_code, v.construction_name, v.work_item,
             v.delivery_unit_name, v.receiving_unit_name, v.export_type_name, v.product_name, v.unit_name,
             v.quantity, v.total_weight_kg, v.shipper_name, v.vehicle_name, v.driver_name, v.carrier_name, v.note,
             pr.full_name, to_char(v.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS')
           ) order by v.id), '[]'::jsonb)
      into v_rows
      from public.inspection_details_view v
      left join public.profiles pr on pr.id = v.created_by
     where v.id = any (p_ids);
    return jsonb_build_object(
      'headers', jsonb_build_array('ID', 'Số phiếu TK', 'Ngày xuất', 'Số phiếu xuất kho', 'Mã CT', 'Tên công trình', 'Hạng mục',
        'Đơn vị giao hàng', 'Đơn vị nhận hàng', 'Loại hình xuất', 'Mặt hàng', 'ĐVT', 'Số lượng', 'Tổng khối lượng (kg)',
        'NV xuất hàng', 'Số xe', 'Tên tài xế', 'Nhà xe', 'Ghi chú', 'Người tạo', 'Giờ tạo'),
      'rows', v_rows);
  end if;
  raise exception 'Bảng không hợp lệ: %', p_tbl;
end $$;

-- Các id kế tiếp (lớn hơn p_after) để đồng bộ lại toàn bộ theo từng trang.
create or replace function public.sheet_ids_after(p_tbl text, p_after bigint, p_limit int)
returns bigint[] language plpgsql stable security definer set search_path = '' as $$
declare
  v_ids bigint[];
begin
  if p_tbl not in ('transport_plans', 'inspection_details') then raise exception 'Bảng không hợp lệ: %', p_tbl; end if;
  execute format('select coalesce(array_agg(id), ''{}'') from (select id from public.%I where id > $1 order by id limit $2) s', p_tbl)
    into v_ids using coalesce(p_after, 0), greatest(p_limit, 1);
  return v_ids;
end $$;

-- Supabase tự cấp execute cho anon/authenticated trên hàm mới → thu hồi rõ ràng, chỉ service role được gọi.
revoke all on function public.claim_sheet_rows(int), public.release_sheet_rows(jsonb), public.acquire_sheet_lock(int, boolean),
  public.release_sheet_lock(), public.sheet_payload(text, bigint[]), public.sheet_ids_after(text, bigint, int)
  from public, anon, authenticated;
grant execute on function public.claim_sheet_rows(int), public.release_sheet_rows(jsonb), public.acquire_sheet_lock(int, boolean),
  public.release_sheet_lock(), public.sheet_payload(text, bigint[]), public.sheet_ids_after(text, bigint, int)
  to service_role;

-- ---------- 5. Kiểm tra ----------
do $$
declare f text;
begin
  assert exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = 'sheet_outbox' and c.relrowsecurity), 'sheet_outbox chưa bật RLS';
  assert exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = 'sheet_sync_lock' and c.relrowsecurity), 'sheet_sync_lock chưa bật RLS';
  assert not has_table_privilege('authenticated', 'public.sheet_outbox', 'select')
     and not has_table_privilege('anon', 'public.sheet_outbox', 'select'), 'sheet_outbox không được mở cho authenticated/anon';
  foreach f in array array['public.claim_sheet_rows(int)', 'public.release_sheet_rows(jsonb)', 'public.acquire_sheet_lock(int,boolean)',
                           'public.release_sheet_lock()', 'public.sheet_payload(text,bigint[])', 'public.sheet_ids_after(text,bigint,int)'] loop
    assert not has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'), f || ' phải chỉ dành cho service role';
    assert has_function_privilege('service_role', f, 'execute'), 'service_role phải gọi được ' || f;
  end loop;
  assert (select count(*) from pg_trigger where not tgisinternal
            and tgname in ('transport_plans_enqueue_sheet', 'inspection_details_enqueue_sheet')) = 2, 'thiếu trigger hàng đợi';
  assert jsonb_array_length(public.sheet_payload('transport_plans', '{}') -> 'headers') = 12, 'tiêu đề phiếu sai';
  assert jsonb_array_length(public.sheet_payload('inspection_details', '{}') -> 'headers') = 21, 'tiêu đề bảng kiểm sai';
end $$;

commit;
