import { useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** Bảng có trong publication supabase_realtime (migration 000023). edit_requests nghe riêng ở useEditRequestNotices. */
export const DB_TABLES = ['transport_plans', 'transport_plan_material_exporters', 'inspection_details', 'lookup_items', 'profiles'] as const
export type DbTable = (typeof DB_TABLES)[number]

type Listener = (table: DbTable) => void
const listeners = new Set<Listener>()
let channel: RealtimeChannel | null = null

// Một kênh dùng chung cho cả app (D-028): mở khi có người nghe đầu tiên, đóng khi người cuối rời đi.
function open() {
  if (channel) return
  const ch = supabase.channel('db-changes')
  for (const table of DB_TABLES) ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => listeners.forEach((l) => l(table)))
  ch.subscribe()
  channel = ch
}
function closeIfIdle() {
  if (listeners.size || !channel) return
  void supabase.removeChannel(channel)
  channel = null
}

/**
 * D-028: ai đó (người khác, lịch tự xóa, SQL Editor) thêm/sửa/xóa trong `tables` → gọi `onChange`.
 * Gom thay đổi dồn dập (lưu nhiều dòng, xóa hàng loạt) thành một lần sau `delay` ms.
 */
export function useDbChange(tables: readonly DbTable[], onChange: () => void, delay = 400) {
  const cb = useRef(onChange)
  useEffect(() => { cb.current = onChange })
  const key = tables.join(',')
  useEffect(() => {
    const watched = new Set(key.split(','))
    let timer: ReturnType<typeof setTimeout> | undefined
    const l: Listener = (t) => {
      if (!watched.has(t)) return
      clearTimeout(timer)
      timer = setTimeout(() => cb.current(), delay)
    }
    listeners.add(l)
    open()
    return () => { clearTimeout(timer); listeners.delete(l); closeIfIdle() }
  }, [key, delay])
}
