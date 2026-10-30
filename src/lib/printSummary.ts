import type { InspectionRow } from '../types/inspection'

const fixed2 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 12500.94 -> "12.500,94"; null -> "" (ô trống trên bản in). */
export function formatFixed2(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : fixed2.format(n)
}

/** Tổng cột số, bỏ qua ô trống. */
export function sumField(rows: InspectionRow[], key: 'quantity' | 'total_weight_kg'): number {
  return rows.reduce((s, r) => s + (r[key] ?? 0), 0)
}

/** Số "Số phiếu xuất kho" khác nhau (bỏ trống). */
export function countSlips(rows: InspectionRow[]): number {
  return new Set(rows.map((r) => r.warehouse_slip_no?.trim()).filter(Boolean)).size
}

/** Nhà xe của các dòng: bỏ trống, bỏ trùng, nối ", ". */
export function carrierList(rows: InspectionRow[]): string {
  return [...new Set(rows.map((r) => r.carrier_name?.trim()).filter(Boolean))].join(', ')
}

/** NV xuất hàng của các dòng: bỏ trống, bỏ trùng, nối ", ". */
export function shipperList(rows: InspectionRow[]): string {
  return [...new Set(rows.map((r) => r.shipper_name?.trim()).filter(Boolean))].join(', ')
}

/** ISO timestamp -> "28/10/2026 21:16:09" theo giờ Asia/Ho_Chi_Minh. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const s = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' }).format(d) // "2026-10-28 21:16:09"
  const m = /^(\d{4})-(\d{2})-(\d{2}) (.+)$/.exec(s)
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : s
}
