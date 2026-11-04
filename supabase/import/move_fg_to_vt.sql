-- T-082 (04/11/2026): NV xuất TP/BTP chỉ là Lê Duy Khánh, Lê Giang Khánh (T-076/T-077).
-- Phiếu ghi người KHÁC ở ô TP/BTP (~4.270 phiếu, từ Google Sheets) -> chuyển người đó lên ĐẦU danh sách NV xuất VT, ô TP/BTP để trống.
-- Bản in vẫn hiện đúng người (pickShipper: TP/BTP, không có thì NV xuất VT đầu tiên); shipper_id của dòng bảng kiểm không cần đổi (so theo tên).
-- Chạy trong SQL Editor. Mỗi câu chạy lại được (lần 2 không còn phiếu nào để chuyển). Chạy lần lượt [0] -> [1] -> [2] -> [3].

-- [0] Xem trước: số phiếu sẽ chuyển theo từng người
select f.name as nv_xuat_tp_btp_hien_tai, count(*) as so_phieu
from public.transport_plans p
join public.lookup_items f on f.id = p.fg_exporter_id
where lower(btrim(f.name)) not in ('lê duy khánh', 'lê giang khánh')
group by f.name order by 2 desc;

-- [1] Người chưa có trong danh mục NV xuất VT (kể cả mục đã ẩn) -> thêm vào
insert into public.lookup_items (kind, name)
select distinct on (lower(f.name)) 'material_exporter', f.name
from public.transport_plans p
join public.lookup_items f on f.id = p.fg_exporter_id
where lower(btrim(f.name)) not in ('lê duy khánh', 'lê giang khánh')
  and not exists (select 1 from public.lookup_items v where v.kind = 'material_exporter' and lower(v.name) = lower(f.name))
order by lower(f.name), f.name;

-- [2] Chuyển (một câu: đẩy người đó lên đầu NV xuất VT, xóa ô TP/BTP). Trả số phiếu/dòng đã đổi.
with t as (
  select p.id as plan_id,
         (select v.id from public.lookup_items v
           where v.kind = 'material_exporter' and lower(v.name) = lower(f.name)
           order by (v.archived_at is null) desc, v.id limit 1) as vt_id
  from public.transport_plans p
  join public.lookup_items f on f.id = p.fg_exporter_id
  where lower(btrim(f.name)) not in ('lê duy khánh', 'lê giang khánh')
), shifted as (  -- người đã có sẵn trong NV xuất VT -> lên vị trí 0; người khác lùi 1
  update public.transport_plan_material_exporters m
  set sort_order = case when m.lookup_id = t.vt_id then 0 else m.sort_order + 1 end
  from t where m.plan_id = t.plan_id and t.vt_id is not null
  returning 1
), added as (
  insert into public.transport_plan_material_exporters (plan_id, lookup_id, sort_order)
  select t.plan_id, t.vt_id, 0 from t
  where t.vt_id is not null
    and not exists (select 1 from public.transport_plan_material_exporters x where x.plan_id = t.plan_id and x.lookup_id = t.vt_id)
  returning 1
), cleared as (
  update public.transport_plans p set fg_exporter_id = null
  from t where p.id = t.plan_id and t.vt_id is not null
  returning 1
)
select (select count(*) from cleared) as phieu_da_chuyen, (select count(*) from added) as nv_vt_them, (select count(*) from shifted) as nv_vt_doi_thu_tu,
       (select count(*) from t where vt_id is null) as khong_tim_thay_nv_vt;  -- phải = 0 (đã chạy [1])

-- [3] Kiểm sau: phải còn 0 phiếu có TP/BTP khác 2 Khánh
select count(*) as con_lai
from public.transport_plans p join public.lookup_items f on f.id = p.fg_exporter_id
where lower(btrim(f.name)) not in ('lê duy khánh', 'lê giang khánh');
