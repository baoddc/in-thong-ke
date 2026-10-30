export type PlanRow = {
  id: number
  tk_number: string
  created_at?: string
  created_by?: string | null
  updated_at?: string | null
  updated_by?: string | null // D-016: người sửa lần cuối (trigger đặt)
  // D-017: tên người tạo/sửa kèm sẵn trong dòng của RPC danh sách
  created_by_name?: string | null
  created_by_username?: string | null
  updated_by_name?: string | null
  updated_by_username?: string | null
  export_date: string | null
  transport_order_no: string | null
  transport_type_id: number | null
  vehicle_id: number | null
  driver_id: number | null
  fg_exporter_id: number | null
  note: string | null
  transport_type: { name: string } | null
  vehicle: { name: string } | null
  driver: { name: string } | null
  fg_exporter: { name: string } | null
  material_exporters: { sort_order?: number | null; lookup: { id: number; name: string } | null }[]
}
