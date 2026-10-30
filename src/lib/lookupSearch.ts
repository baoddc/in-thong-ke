import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { errorMessage, formatDate } from './format'

// Danh mục nhỏ tải sẵn hết; danh mục lớn (D-012) chỉ tìm phía server khi gõ.
export const BIG_KINDS: readonly string[] = ['vehicle', 'driver', 'receiving_unit', 'construction']
export const isBigKind = (k: string) => BIG_KINDS.includes(k)

export type Opt = { id: number; name: string; code?: string | null; hint?: string }
type Err = { code?: string; message?: string } | null
export type SearchFn = (q: string) => PromiseLike<{ data: Opt[] | null; error: Err }>

// Nhớ tên theo (kind, id) để ô remount (vd Mã ↔ Tên công trình) hiện tên ngay, không gọi lại server.
const cache = new Map<string, Opt>()
export const remember = (kind: string, items: Opt[]) => items.forEach((i) => cache.set(`${kind}:${i.id}`, { id: i.id, name: i.name, code: i.code }))
export const recall = (kind: string, id: number) => cache.get(`${kind}:${id}`)
export const forgetLookups = () => cache.clear() // gọi khi sửa/xóa mục ở trang Danh mục

/** kind='plan': tìm số phiếu TK (kèm ngày xuất); còn lại: tìm mục danh mục lớn theo tên hoặc mã. Tối đa 20 mục. */
export function searchFn(kind: string): SearchFn {
  if (kind === 'plan') {
    return (q) => supabase.rpc('search_plan_numbers', { p_q: q, p_limit: 20 }).then((r) => {
      const data = r.data?.map((p) => ({ id: p.id, name: p.tk_number, hint: p.export_date ? formatDate(p.export_date) : undefined })) ?? null
      if (data) remember('plan', data)
      return { error: r.error, data }
    })
  }
  return (q) => supabase.rpc('search_lookup_items', { p_kind: kind, p_q: q, p_limit: 20 }).then((r) => {
    if (r.data) remember(kind, r.data)
    return r
  })
}

/** Lấy tên các id chưa biết (get_lookup_items). */
export const resolveFn = (kind: string, ids: number[]) =>
  supabase.rpc('get_lookup_items', { p_ids: ids }).then((r) => {
    if (r.data) remember(kind, r.data)
    return r
  })

export const SEARCH_DELAY_MS = 250

/**
 * Gõ → đợi 250 ms → gọi `search`. Kết quả của lần gọi cũ (về muộn) bị bỏ.
 * `settled`: kết quả hiện có đúng là của chữ đang gõ.
 */
export function useRemoteOptions(search: SearchFn | null, q: string, enabled: boolean) {
  const [state, setState] = useState<{ q: string | null; items: Opt[]; error: string }>({ q: null, items: [], error: '' })
  useEffect(() => {
    if (!search || !enabled) return
    let alive = true
    const t = setTimeout(() => {
      search(q).then((r) => {
        if (!alive) return
        setState({ q, items: r.data ?? [], error: r.error ? errorMessage(r.error) : '' })
      })
    }, SEARCH_DELAY_MS)
    return () => { alive = false; clearTimeout(t) }
  }, [search, q, enabled])
  return { items: state.items, error: state.error, settled: state.q === q }
}
