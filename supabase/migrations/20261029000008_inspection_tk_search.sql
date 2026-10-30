-- T-031 / D-012: tìm nhanh bảng kiểm theo số TK + số phiếu xuất kho.
-- Vấn đề: view lấy tk_number từ transport_plans (left join) nên .or(tk_number.ilike, warehouse_slip_no.ilike)
-- trải 2 bảng => Seq Scan cả hai. Giải pháp: sao chép số TK (bất biến nhờ lock_tk_fields) vào inspection_details
-- để cả hai điều kiện cùng một bảng => BitmapOr trên 2 index trigram.
-- Viết để chạy lại được khi dán vào SQL Editor (if not exists / or replace / drop if exists). Không dùng bảng tạm.
begin;

-- ---------- 1. Cột sao chép + trigger ----------
alter table public.inspection_details add column if not exists tk_number text;
comment on column public.inspection_details.tk_number is
  'Bản sao transport_plans.tk_number, do trigger điền; chỉ đọc (FE không ghi). Phục vụ tìm kiếm trigram.';

create or replace function public.inspection_details_fill_tk()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.tk_number := (select p.tk_number from public.transport_plans p where p.id = new.plan_id);
  return new;
end $$;
revoke all on function public.inspection_details_fill_tk() from public, anon, authenticated;

drop trigger if exists inspection_details_fill_tk on public.inspection_details;
create trigger inspection_details_fill_tk before insert or update of plan_id on public.inspection_details
  for each row execute function public.inspection_details_fill_tk();

-- Backfill: chỉ dòng lệch (chạy lại = 0 dòng). Tạm tắt trigger updated_at và trigger thống kê để không đổi
-- updated_at của ~42.000 dòng và không chạy upsert thống kê vô ích (không cột thống kê nào đổi).
-- Cả hai được bật lại ngay trong cùng giao dịch; trong lúc đó bảng bị khóa ghi nên không có ghi chen ngang.
alter table public.inspection_details disable trigger inspection_details_set_updated_at;
alter table public.inspection_details disable trigger inspection_details_stats_upd;
update public.inspection_details d
   set tk_number = p.tk_number
  from public.transport_plans p
 where p.id = d.plan_id and d.tk_number is distinct from p.tk_number;
alter table public.inspection_details enable trigger inspection_details_set_updated_at;
alter table public.inspection_details enable trigger inspection_details_stats_upd;

-- ---------- 2. Index trigram (warehouse_slip_no đã có từ 000006) ----------
create index if not exists inspection_details_tk_number_trgm_idx
  on public.inspection_details using gin (tk_number extensions.gin_trgm_ops);

-- ---------- 3. View: y nguyên 000005, chỉ đổi tk_number -> d.tk_number ----------
create or replace view public.inspection_details_view with (security_invoker = true) as
select
  d.id,
  d.plan_id,
  d.tk_number,
  p.transport_order_no,
  d.export_date,
  d.warehouse_slip_no,
  d.construction_id,
  con.code as construction_code,
  con.name as construction_name,
  d.work_item,
  d.delivery_unit_id,
  du.name as delivery_unit_name,
  d.receiving_unit_id,
  ru.name as receiving_unit_name,
  d.export_type_id,
  et.name as export_type_name,
  d.product_id,
  pr.name as product_name,
  d.unit_id,
  un.name as unit_name,
  d.quantity,
  d.total_weight_kg,
  coalesce(sh.name, fg.name, mx.name) as shipper_name,  -- người được chọn cho dòng; trống thì theo phiếu (TP/BTP, rồi NV xuất VT đầu tiên)
  veh.name as vehicle_name,
  drv.name as driver_name,
  d.carrier_id,
  ca.name as carrier_name,
  d.note,
  d.created_at,
  d.updated_at,
  d.shipper_id,
  coalesce(fg.name, mx.name) as plan_shipper_name
from public.inspection_details d
left join public.transport_plans p on p.id = d.plan_id
left join public.lookup_items con on con.id = d.construction_id
left join public.lookup_items du on du.id = d.delivery_unit_id
left join public.lookup_items ru on ru.id = d.receiving_unit_id
left join public.lookup_items et on et.id = d.export_type_id
left join public.lookup_items pr on pr.id = d.product_id
left join public.lookup_items un on un.id = d.unit_id
left join public.lookup_items ca on ca.id = d.carrier_id
left join public.lookup_items sh on sh.id = d.shipper_id
left join public.lookup_items fg on fg.id = p.fg_exporter_id
left join public.lookup_items veh on veh.id = p.vehicle_id
left join public.lookup_items drv on drv.id = p.driver_id
left join lateral (
  select l.name
  from public.transport_plan_material_exporters m
  join public.lookup_items l on l.id = m.lookup_id
  where m.plan_id = d.plan_id
  order by m.sort_order, m.lookup_id
  limit 1
) mx on true;

revoke all on public.inspection_details_view from anon;
grant select on public.inspection_details_view to authenticated;

-- ---------- 4. Tìm danh mục không dấu (gõ "dang" ra "Đặng", "nguyen van" ra "Nguyễn Văn") ----------
create extension if not exists unaccent with schema extensions;

-- unaccent() gốc chỉ STABLE; dạng 2 tham số với từ điển cố định là an toàn để khai báo IMMUTABLE (dùng cho index).
-- translate đ/Đ -> d như lớp bảo hiểm (nếu unaccent.rules không có thì vẫn đúng).
create or replace function public.f_search_norm(x text)
returns text language sql immutable parallel safe strict set search_path = ''
as $$ select translate(lower(extensions.unaccent('extensions.unaccent'::regdictionary, x)), 'đ', 'd') $$;
revoke all on function public.f_search_norm(text) from public, anon;
grant execute on function public.f_search_norm(text) to authenticated;

create index if not exists lookup_items_name_norm_trgm_idx
  on public.lookup_items using gin (public.f_search_norm(name) extensions.gin_trgm_ops);
create index if not exists lookup_items_code_norm_trgm_idx
  on public.lookup_items using gin (public.f_search_norm(code) extensions.gin_trgm_ops);

-- Giữ chữ ký và kiểu trả về của 000007; chỉ đổi so khớp sang dạng đã bỏ dấu + thường. Escape \ % _ giữ nguyên.
create or replace function public.search_lookup_items(p_kind text, p_q text, p_limit int default 20)
returns setof public.lookup_items
language sql stable security invoker set search_path = ''
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
      where k.q = '' and i.kind = p_kind
      order by i.name, i.id
      limit k.n)
    union all
    (select i as i,
            case when public.f_search_norm(i.name) like k.e || '%' or public.f_search_norm(i.code) like k.e || '%' then 0 else 1 end as rk
       from public.lookup_items i
      where k.q <> '' and i.kind = p_kind
        and (public.f_search_norm(i.name) like '%' || k.e || '%' or public.f_search_norm(i.code) like '%' || k.e || '%')
      order by rk, i.name, i.id
      limit k.n)
  ) r
  order by r.rk, (r.i).name, (r.i).id
$$;
revoke all on function public.search_lookup_items(text,text,int) from public, anon;
grant execute on function public.search_lookup_items(text,text,int) to authenticated;

-- ---------- 5. Kiểm tra ----------
do $$
begin
  assert public.f_search_norm('Đặng Văn') = 'dang van', 'f_search_norm sai: ' || public.f_search_norm('Đặng Văn');
  assert public.f_search_norm('Nguyễn Văn ĐỨC') = 'nguyen van duc', 'f_search_norm sai (hoa/đ)';
  assert (select count(*) from public.search_lookup_items('driver', 'dang', 50)) >= 0, 'search_lookup_items lỗi';
  assert exists (select 1 from pg_indexes where schemaname = 'public'
                 and indexname in ('lookup_items_name_norm_trgm_idx')) and exists (select 1 from pg_indexes
                 where schemaname = 'public' and indexname = 'lookup_items_code_norm_trgm_idx'), 'thiếu index norm trigram';
  assert (select count(*) from public.inspection_details d join public.transport_plans p on p.id = d.plan_id
          where d.tk_number is distinct from p.tk_number) = 0, 'còn dòng tk_number lệch với transport_plans';
  assert not exists (select 1 from public.inspection_details where plan_id is null and tk_number is not null),
    'dòng không có phiếu mà có tk_number';
  assert exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'inspection_details_tk_number_trgm_idx'),
    'thiếu index inspection_details_tk_number_trgm_idx';
  assert (select count(*) from pg_trigger where tgrelid = 'public.inspection_details'::regclass
          and tgname in ('inspection_details_set_updated_at', 'inspection_details_stats_upd', 'inspection_details_fill_tk')
          and tgenabled = 'O') = 3, 'trigger chưa bật lại đủ';
  assert (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'inspection_details_view') = 32, 'view: số cột thay đổi';
  assert pg_get_viewdef('public.inspection_details_view'::regclass) ilike '%d.tk_number%', 'view chưa lấy d.tk_number';
  perform 1 from public.inspection_details_view limit 1;
end $$;

commit;

-- ---------- Kiểm tra bằng EXPLAIN (chạy riêng, ngoài migration) ----------
-- Kỳ vọng: Bitmap Index Scan trên inspection_details_tk_number_trgm_idx VÀ inspection_details_warehouse_slip_no_trgm_idx
-- (BitmapOr), không Seq Scan trên inspection_details / transport_plans cho nhánh lọc.
-- analyze public.inspection_details;
-- explain (analyze, buffers)
-- select * from public.inspection_details_view
-- where tk_number ilike '%2024/05-3%' or warehouse_slip_no ilike '%2024/05-3%'
-- order by created_at desc, id desc limit 50;
--
-- Tìm danh mục không dấu: kỳ vọng Bitmap Index Scan trên lookup_items_name_norm_trgm_idx / lookup_items_code_norm_trgm_idx
-- (BitmapOr) khi từ khóa >= 3 ký tự. Lưu ý: trong hàm, planner có thể dùng generic plan; để thấy index hãy thử trực tiếp:
-- analyze public.lookup_items;
-- explain (analyze, buffers)
-- select * from public.lookup_items i
-- where i.kind = 'driver'
--   and (public.f_search_norm(i.name) like '%nguyen van%' or public.f_search_norm(i.code) like '%nguyen van%')
-- order by i.name, i.id limit 50;
-- select name from public.search_lookup_items('driver', 'nguyen van', 20);
