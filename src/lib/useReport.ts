import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { useDbChange } from './dbChanges'

export type MonthRow = { month: number; lines: number; weightKg: number } // month 1..12
export type RankRow = { name: string; lines: number; weightKg: number }
type Report = { months: MonthRow[]; prevMonths: MonthRow[]; types: RankRow[]; products: RankRow[]; plans: number | null; loading: boolean; error: string }

const EMPTY: Report = { months: [], prevMonths: [], types: [], products: [], plans: null, loading: true, error: '' }
const TOP_PRODUCTS = 8

type StatRow = { key_name: string | null; row_count: number; weight_kg_sum: number | null }
const toMonths = (rows: StatRow[] | null, year: number): MonthRow[] => {
  const byMonth = new Map((rows ?? []).map((r) => [r.key_name, r]))
  return Array.from({ length: 12 }, (_, i) => {
    const r = byMonth.get(`${year}-${String(i + 1).padStart(2, '0')}`)
    return { month: i + 1, lines: Number(r?.row_count ?? 0), weightKg: Number(r?.weight_kg_sum ?? 0) }
  })
}
// Loại hình/mặt hàng đã hết dòng trong kỳ vẫn được RPC trả về với tổng 0 → bỏ.
const toRanked = (rows: StatRow[] | null, none: string): RankRow[] =>
  (rows ?? [])
    .map((r) => ({ name: r.key_name ?? none, lines: Number(r.row_count), weightKg: Number(r.weight_kg_sum ?? 0) }))
    .filter((x) => x.lines > 0)
    .sort((a, b) => b.weightKg - a.weightKg)

const isoUtc = (d: Date) => d.toISOString().slice(0, 10)
const shiftYear = (iso: string, by: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() + by); return isoUtc(d) }
export const nextDay = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return isoUtc(d) }

/** Báo cáo trong khoảng ngày [dateFrom, dateTo] (gồm cả hai đầu, cùng một năm — phần quá cuối năm của dateFrom bị cắt): theo tháng (và cùng kỳ năm trước), loại hình xuất, mặt hàng xuất nhiều nhất, số phiếu. Số liệu cộng ở database (inspection_stats), không tải dòng nào. */
export function useReport(dateFrom: string, dateTo: string) {
  const [data, setData] = useState<Report>(EMPTY)

  const seq = useRef(0) // mỗi lần tải một số; kết quả của lần tải cũ (đổi bộ lọc, tải chồng) bị bỏ
  const reload = useCallback(async () => {
    const id = ++seq.current
    if (!dateFrom || !dateTo || dateFrom > dateTo) { setData({ ...EMPTY, loading: false, error: 'Khoảng ngày không hợp lệ: "Từ ngày" phải trước hoặc bằng "Đến ngày".' }); return }
    const year = Number(dateFrom.slice(0, 4))
    const from = dateFrom
    const to = [nextDay(dateTo), `${year + 1}-01-01`].sort()[0] // cận trên không gồm; không vượt cuối năm vì biểu đồ chỉ có 12 tháng
    const stat = (f: string, t: string, g: 'month' | 'export_type' | 'product') => supabase.rpc('inspection_stats', { p_from: f, p_to: t, p_group: g })
    const [m, t, pm, pr, p] = await Promise.all([
      stat(from, to, 'month'),
      stat(from, to, 'export_type'),
      stat(shiftYear(from, -1), shiftYear(to, -1), 'month'), // cùng kỳ năm trước
      stat(from, to, 'product'),
      supabase.from('transport_plans').select('id', { count: 'exact', head: true }).gte('export_date', from).lt('export_date', to),
    ])
    if (id !== seq.current) return
    if (m.error || t.error) { setData({ ...EMPTY, loading: false, error: 'Không tải được số liệu báo cáo. Thử tải lại trang.' }); return }
    setData({
      months: toMonths(m.data, year),
      prevMonths: pm.error ? [] : toMonths(pm.data, year - 1), // phần phụ: lỗi thì ẩn so sánh, không chặn cả trang
      types: toRanked(t.data, 'Chưa chọn loại hình'),
      products: pr.error ? [] : toRanked(pr.data, 'Chưa chọn mặt hàng').slice(0, TOP_PRODUCTS),
      plans: p.error ? null : (p.count ?? 0), loading: false, error: '',
    })
  }, [dateFrom, dateTo])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- tải lần đầu và khi đổi bộ lọc, setState chạy sau await
  useEffect(() => { setData(EMPTY); void reload() }, [reload])
  useDbChange(['transport_plans', 'inspection_details'], () => void reload(), 5000)
  return { ...data, reload: () => void reload() }
}
