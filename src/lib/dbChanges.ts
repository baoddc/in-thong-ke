import { useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** Bảng có trong publication supabase_realtime (migration 000023). edit_requests nghe riêng ở useEditRequestNotices. */
export const DB_TABLES = ['transport_plans', 'transport_plan_material_exporters', 'inspection_details', 'lookup_items', 'profiles'] as const
export type DbTable = (typeof DB_TABLES)[number]

type Listener = (table: DbTable) => void
const listeners = new Set<Listener>()
let channel: RealtimeChannel | null = null
const pending = new Set<DbTable>()

// Tab ẩn không tải lại (mỗi request = 1 dòng log Supabase, gói free 1 GB): ghi nhớ bảng đổi, mở lại tab thì tải một lần.
const emit = (table: DbTable) => listeners.forEach((l) => l(table))
function onChange(table: DbTable) {
  if (document.visibilityState === 'hidden') pending.add(table)
  else emit(table)
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') return
  pending.forEach(emit)
  pending.clear()
})

// Một kênh dùng chung cho cả app (D-028): mở khi có người nghe đầu tiên, đóng khi người cuối rời đi.
function open() {
  if (channel) return
  const ch = supabase.channel('db-changes')
  for (const table of DB_TABLES) ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange(table))
  let joined = false
  // Rớt mạng rồi nối lại → có thể đã lỡ thay đổi: tải lại mọi thứ một lần (thay cho việc hỏi server định kỳ).
  ch.subscribe((status: string) => {
    if (status !== 'SUBSCRIBED') return
    if (joined) DB_TABLES.forEach(onChange)
    joined = true
  })
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
