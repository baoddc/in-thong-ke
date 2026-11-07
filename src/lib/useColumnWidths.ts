import { useCallback, useRef, useState } from 'react'

const KEY = 'col-w:'
export const MIN_COL_W = 56
export const MAX_COL_W = 800

function read(key: string): Record<string, number> {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(KEY + key) ?? '{}')
    if (typeof v !== 'object' || v === null) return {}
    return Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === 'number' && n >= MIN_COL_W && n <= MAX_COL_W))
  } catch { return {} } // localStorage bị chặn / dữ liệu hỏng → dùng độ rộng mặc định
}

/** Độ rộng cột do người dùng kéo (px), nhớ theo `key` (mỗi bảng một khóa). `set(col, null)` = về mặc định. */
export function useColumnWidths(key: string) {
  const [widths, setWidths] = useState(() => read(key))
  const latest = useRef(widths)
  const set = useCallback((col: string, w: number | null, persist: boolean) => {
    const next = { ...latest.current }
    if (w === null) delete next[col]
    else next[col] = Math.min(MAX_COL_W, Math.max(MIN_COL_W, Math.round(w)))
    latest.current = next
    setWidths(next)
    if (persist) {
      try { window.localStorage.setItem(KEY + key, JSON.stringify(next)) } catch { /* chỉ mất việc nhớ */ }
    }
  }, [key])
  return { widths, set }
}
