import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { useDbChange } from './dbChanges'
import { nextDay } from './useReport'

export type MatrixMode = 'product' | 'project' | 'top'
export type TypeCol = { id: number | null; name: string }
export type Matrix = {
  types: TypeCol[]                       // cột: loại hình xuất, theo số thứ tự trong tên; "Chưa chọn" ở cuối nếu có dòng
  cells: Map<string, Map<number | null, number>> // hàng → loại hình → kg
  rowOrder: string[]                      // thứ tự hàng (nhóm theo số thứ tự; dự án theo khối lượng giảm dần)
  projects: { project: string; weightKg: number }[] // chỉ mode 'project': ô chọn dự án
  loading: boolean; error: string
}
const EMPTY: Matrix = { types: [], cells: new Map(), rowOrder: [], projects: [], loading: true, error: '' }
const TOP_N = 10
const num = (s: string) => Number(/^\d+/.exec(s)?.[0] ?? 1e9) // "10 - Sơn" → 10 (sắp theo số, không theo chữ)

/** Ma trận khối lượng (kg) trong [from, to] gồm cả hai đầu. mode: nhóm mặt hàng × loại hình | một dự án | top 10 dự án. Cộng ở database (report_matrix). */
export function useMatrix(from: string, to: string, mode: MatrixMode, project: string) {
  const [data, setData] = useState<Matrix>(EMPTY)
  const seq = useRef(0)
  const reload = useCallback(async () => {
    const id = ++seq.current
    if (!from || !to || from > to) { setData({ ...EMPTY, loading: false, error: 'Khoảng ngày không hợp lệ: "Từ ngày" phải trước hoặc bằng "Đến ngày".' }); return }
    const end = nextDay(to)
    const [types, m, pj] = await Promise.all([
      supabase.from('lookup_items').select('id,name').eq('kind', 'export_type').is('archived_at', null),
      mode === 'top'
        ? supabase.rpc('report_matrix', { p_from: from, p_to: end, p_by: 'project', p_limit: TOP_N })
        : supabase.rpc('report_matrix', { p_from: from, p_to: end, p_by: 'product', p_project: mode === 'project' ? project : null }),
      mode === 'project' ? supabase.rpc('report_projects', { p_from: from, p_to: end }) : Promise.resolve({ data: [], error: null }),
    ])
    if (id !== seq.current) return
    if (types.error || m.error) { setData({ ...EMPTY, loading: false, error: 'Không tải được số liệu báo cáo. Thử tải lại trang.' }); return }
    const cells = new Map<string, Map<number | null, number>>()
    const rowKg = new Map<string, number>()
    const used = new Set<number | null>()
    for (const r of m.data ?? []) {
      const kg = Number(r.weight_kg_sum ?? 0)
      const row = cells.get(r.row_key) ?? new Map<number | null, number>()
      row.set(r.export_type_id, kg); cells.set(r.row_key, row)
      rowKg.set(r.row_key, (rowKg.get(r.row_key) ?? 0) + kg)
      used.add(r.export_type_id)
    }
    const cols: TypeCol[] = [...(types.data ?? [])].sort((a, b) => num(a.name) - num(b.name)).map((t) => ({ id: t.id, name: t.name }))
    if (used.has(null)) cols.push({ id: null, name: 'Chưa chọn loại hình' })
    const keys = [...cells.keys()]
    setData({
      types: cols, cells,
      rowOrder: mode === 'product' ? keys.sort((a, b) => num(a) - num(b) || a.localeCompare(b)) : keys.sort((a, b) => (rowKg.get(b) ?? 0) - (rowKg.get(a) ?? 0) || a.localeCompare(b)),
      projects: pj.error ? [] : (pj.data ?? []).map((p) => ({ project: p.project, weightKg: Number(p.weight_kg_sum ?? 0) })),
      loading: false, error: '',
    })
  }, [from, to, mode, project])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- tải lần đầu và khi đổi bộ lọc, setState chạy sau await
  useEffect(() => { setData(EMPTY); void reload() }, [reload])
  useDbChange(['inspection_details'], () => void reload(), 5000)
  return { ...data, reload: () => void reload() }
}
