-- Đồng bộ Google Sheet: đủ mọi cột người dùng thấy trên hệ thống.
-- Thêm cuối mỗi tab (các cột cũ giữ nguyên vị trí nên Sheet đã đồng bộ không bị lệch):
--   Phiếu:     + Người sửa, Giờ sửa                              (12 → 14 cột)
--   Bảng kiểm: + Số lệnh vận chuyển, Người sửa, Giờ sửa          (21 → 24 cột)
-- Không đưa: cột kỹ thuật (tk_year/tk_month/tk_seq tính từ số phiếu TK, plan_id, import_ref).
begin;

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
             p.note, pr.full_name, to_char(p.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS'),
             ub.full_name, case when p.updated_by is not null then to_char(p.updated_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS') end
           ) order by p.id), '[]'::jsonb)
      into v_rows
      from public.transport_plans p
      left join public.lookup_items tt on tt.id = p.transport_type_id
      left join public.lookup_items veh on veh.id = p.vehicle_id
      left join public.lookup_items drv on drv.id = p.driver_id
      left join public.lookup_items fg on fg.id = p.fg_exporter_id
      left join public.profiles pr on pr.id = p.created_by
      left join public.profiles ub on ub.id = p.updated_by
     where p.id = any (p_ids);
    return jsonb_build_object(
      'headers', jsonb_build_array('ID', 'Số phiếu TK', 'Ngày xuất', 'Số lệnh vận chuyển', 'Phân loại VC', 'Số xe', 'Tên tài xế', 'NV xuất TP/BTP', 'NV xuất VT', 'Ghi chú', 'Người tạo', 'Giờ tạo', 'Người sửa', 'Giờ sửa'),
      'rows', v_rows);
  elsif p_tbl = 'inspection_details' then
    select coalesce(jsonb_agg(jsonb_build_array(
             v.id, v.tk_number, v.export_date::text, v.warehouse_slip_no, v.construction_code, v.construction_name, v.work_item,
             v.delivery_unit_name, v.receiving_unit_name, v.export_type_name, v.product_name, v.unit_name,
             v.quantity, v.total_weight_kg, v.shipper_name, v.vehicle_name, v.driver_name, v.carrier_name, v.note,
             pr.full_name, to_char(v.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS'),
             v.transport_order_no,
             ub.full_name, case when v.updated_by is not null then to_char(v.updated_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS') end
           ) order by v.id), '[]'::jsonb)
      into v_rows
      from public.inspection_details_view v
      left join public.profiles pr on pr.id = v.created_by
      left join public.profiles ub on ub.id = v.updated_by
     where v.id = any (p_ids);
    return jsonb_build_object(
      'headers', jsonb_build_array('ID', 'Số phiếu TK', 'Ngày xuất', 'Số phiếu xuất kho', 'Mã CT', 'Tên công trình', 'Hạng mục',
        'Đơn vị giao hàng', 'Đơn vị nhận hàng', 'Loại hình xuất', 'Mặt hàng', 'ĐVT', 'Số lượng', 'Tổng khối lượng (kg)',
        'NV xuất hàng', 'Số xe', 'Tên tài xế', 'Nhà xe', 'Ghi chú', 'Người tạo', 'Giờ tạo', 'Số lệnh vận chuyển', 'Người sửa', 'Giờ sửa'),
      'rows', v_rows);
  end if;
  raise exception 'Bảng không hợp lệ: %', p_tbl;
end $$;

-- create or replace giữ nguyên quyền, nhưng khẳng định lại: chỉ service role gọi được.
revoke all on function public.sheet_payload(text, bigint[]) from public, anon, authenticated;
grant execute on function public.sheet_payload(text, bigint[]) to service_role;

do $$
begin
  assert jsonb_array_length(public.sheet_payload('transport_plans', '{}') -> 'headers') = 14, 'tiêu đề phiếu sai';
  assert jsonb_array_length(public.sheet_payload('inspection_details', '{}') -> 'headers') = 24, 'tiêu đề bảng kiểm sai';
  assert not has_function_privilege('authenticated', 'public.sheet_payload(text,bigint[])', 'execute'), 'sheet_payload phải chỉ dành cho service role';
end $$;

commit;
