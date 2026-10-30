import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { todayISO } from './format'
import { monthRange } from './listQuery'

type Stats = { plans: number | null; lines: number | null; weightKg: number | null; weightError: string }

/**
 * Số phiếu, số dòng bảng kiểm và tổng khối lượng (kg) trong tháng này. Head count + RPC, không tải dòng nào.
 * Mỗi số lỗi riêng: lỗi → null (thẻ hiện "—"), không ảnh hưởng thẻ khác.
 */
export function useMonthStats() {
  const [stats, setStats] = useState<Stats>({ plans: null, lines: null, weightKg: null, weightError: '' })

  const reload = useCallback(async () => {
    const [from, to] = monthRange(todayISO())
    const count = (table: 'transport_plans' | 'inspection_details') =>
      supabase.from(table).select('id', { count: 'exact', head: true }).gte('export_date', from).lt('export_date', to)
    const [p, l, w] = await Promise.all([count('transport_plans'), count('inspection_details'), supabase.rpc('inspection_weight_total', { p_from: from, p_to: to })])
    setStats({
      plans: p.error ? null : (p.count ?? 0),
      lines: l.error ? null : (l.count ?? 0),
      weightKg: w.error ? null : Number(w.data ?? 0),
      weightError: w.error ? (w.error.message ?? 'Không tải được tổng khối lượng') : '',
    })
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- tải dữ liệu lần đầu, setState chạy sau await
  useEffect(() => { void reload() }, [reload])
  return { ...stats, reload }
}
