import type { PlanRow } from '../types/plan'

export const PLAN_SELECT =
  '*, transport_type:lookup_items!transport_plans_transport_type_id_fkey(name), vehicle:lookup_items!transport_plans_vehicle_id_fkey(name), driver:lookup_items!transport_plans_driver_id_fkey(name), fg_exporter:lookup_items!transport_plans_fg_exporter_id_fkey(name), material_exporters:transport_plan_material_exporters(sort_order,lookup:lookup_items(id,name))'

/** NV xuất VT theo thứ tự được chọn (sort_order tăng dần; thiếu thì giữ thứ tự gốc). */
export function sortedMaterials(plan: Pick<PlanRow, 'material_exporters'>) {
  return [...plan.material_exporters].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

type Named = { id: number; name: string }

/** Danh sách chọn NV xuất hàng = NV xuất TP/BTP + NV xuất VT; trùng tên (không phân biệt hoa thường) chỉ giữ mục TP/BTP. */
export function mergeShippers<T extends Named>(fg: T[], material: T[]): T[] {
  const seen = new Set<string>()
  return [...fg, ...material].filter((i) => {
    const k = i.name.trim().toLowerCase()
    return !seen.has(k) && seen.add(k)
  })
}

/** Id (trong danh sách đã gộp) của người theo phiếu; không có/không khớp → null. */
export function planShipperId(shippers: Named[], plan: Pick<PlanRow, 'fg_exporter' | 'material_exporters'> | null): number | null {
  const name = plan ? pickShipper(plan).trim().toLowerCase() : ''
  return name ? (shippers.find((i) => i.name.trim().toLowerCase() === name)?.id ?? null) : null
}

/** Giá trị lưu `shipper_id`: trống hoặc trùng người theo phiếu → null (dòng tự theo phiếu); khác → id đã chọn. */
export function shipperIdToSave(selectedId: number | null, planId: number | null): number | null {
  return selectedId !== null && selectedId !== planId ? selectedId : null
}

/** NV xuất hàng = NV xuất TP/BTP; không có thì NV xuất VT được chọn đầu tiên. */
export function pickShipper(plan: Pick<PlanRow, 'fg_exporter' | 'material_exporters'>): string {
  return plan.fg_exporter?.name || sortedMaterials(plan).find((m) => m.lookup?.name)?.lookup?.name || ''
}
