// Hàng của view inspection_details_view (khai báo tay để không phụ thuộc kiểu sinh tự động của view).
export type InspectionRow = {
  id: number
  plan_id: number | null // null: dòng dữ liệu cũ chưa có số phiếu TK
  tk_number: string | null
  transport_order_no: string | null
  export_date: string | null
  warehouse_slip_no: string | null
  construction_id: number | null
  construction_code: string | null
  construction_name: string | null
  work_item: string | null
  delivery_unit_id: number | null
  delivery_unit_name: string | null
  receiving_unit_id: number | null
  receiving_unit_name: string | null
  export_type_id: number | null
  export_type_name: string | null
  product_id: number | null
  product_name: string | null
  unit_id: number | null
  unit_name: string | null
  quantity: number | null
  total_weight_kg: number | null
  shipper_id: number | null // null: theo phiếu TK
  shipper_name: string | null // đã chọn nếu có, không thì theo phiếu
  plan_shipper_name: string | null
  vehicle_name: string | null
  driver_name: string | null
  carrier_id: number | null
  carrier_name: string | null
  note: string | null
  created_at?: string | null
  created_by?: string | null // D-013
  updated_at?: string | null
  updated_by?: string | null // D-016: cột cuối của view
  // D-017: tên người tạo/sửa kèm sẵn trong dòng của RPC list_inspection_details
  created_by_name?: string | null
  created_by_username?: string | null
  updated_by_name?: string | null
  updated_by_username?: string | null
}
