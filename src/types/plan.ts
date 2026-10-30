export type PlanRow = {
  id: number
  tk_number: string
  created_at?: string
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
