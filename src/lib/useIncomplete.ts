import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useDbChange } from './dbChanges'
import type { Database } from '../types/database'

export type IncompleteItem = Database['public']['Functions']['my_incomplete_items']['Returns'][number]

export const BLOCKED_MSG = 'Bạn còn phiếu/dòng quá 24 giờ chưa điền đủ thông tin. Hãy điền đủ trước khi thao tác khác.'

/**
 * D-029: phiếu/dòng còn thiếu của chính mình. `blocked` = có mục đã quá hạn (tạo + 24h) → bị khóa thao tác khác,
 * chỉ được sửa các mục thiếu (`has`). Quyền thật do DB (trigger + can_update_row) quyết định; đây chỉ để khóa nút.
 */
export function useIncomplete() {
  const [state, setState] = useState<{ items: IncompleteItem[]; blocked: boolean }>({ items: [], blocked: false })
  const [tick, setTick] = useState(0)
  useDbChange(['transport_plans', 'transport_plan_material_exporters', 'inspection_details'], () => setTick((t) => t + 1), 800)

  useEffect(() => {
    let alive = true
    let t: ReturnType<typeof setTimeout> | undefined
    void supabase.rpc('my_incomplete_items').then((r) => {
      if (!alive || r.error) return
      const items = r.data ?? []
      const check = () => {
        const now = Date.now()
        setState({ items, blocked: items.some((i) => Date.parse(i.due_at) <= now) })
        // Hết hạn trong lúc đang mở trang → tự khóa bằng hẹn giờ ở máy, không hỏi lại server mỗi phút (tiết kiệm log).
        const next = Math.min(...items.map((i) => Date.parse(i.due_at)).filter((d) => d > now))
        if (Number.isFinite(next)) t = setTimeout(check, Math.min(next - now + 500, 2 ** 31 - 1))
      }
      check()
    })
    return () => { alive = false; clearTimeout(t) }
  }, [tick])

  const has = (kind: 'plan' | 'detail', id: number) => state.items.some((i) => i.item_kind === kind && i.id === id)
  return { ...state, has }
}
