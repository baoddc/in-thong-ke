import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { normalize } from './lookupMatch'

// Dùng chung cho mọi ô tròn trong bảng: tải một lần, mọi chip dùng lại (không gọi mỗi dòng).
let cache: Map<string, string> | null = null
let pending: Promise<void> | null = null
const subs = new Set<() => void>()

function load() {
  if (cache || pending) return
  // shortcut: chỉ tải một lần mỗi lần mở trang; ảnh mới của người khác hiện sau khi tải lại trang
  pending = Promise.resolve(supabase.rpc('get_avatar_paths')).then((r) => {
    const rows = (r?.data ?? []) as { full_name: string; avatar_path: string }[]
    if (r && !r.error) cache = new Map(rows.map((x) => [normalize(x.full_name), x.avatar_path]))
  }).catch(() => undefined).finally(() => { pending = null; subs.forEach((f) => f()) })
}

/** Đường dẫn ảnh đại diện của người có họ tên `name` (không phân biệt hoa/thường/dấu); chưa có thì null. */
export function useAvatarByName(name: string): string | null {
  const [, setN] = useState(0)
  useEffect(() => {
    const f = () => setN((n) => n + 1)
    subs.add(f)
    load()
    return () => { subs.delete(f) }
  }, [])
  return cache?.get(normalize(name)) ?? null
}
