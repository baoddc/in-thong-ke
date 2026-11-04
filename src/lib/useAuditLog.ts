import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { errorMessage } from './format'
import type { Database } from '../types/database'

export type AuditRow = Database['public']['Tables']['audit_log']['Row']
export type AuditFilters = { from: string; to: string; actor: string; action: string; table: string }

/** Cột *_id (trừ plan_id) chứa id danh mục → tra tên bằng get_lookup_items. */
export const isLookupKey = (k: string) => k.endsWith('_id') && k !== 'plan_id'

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** Mọi id danh mục xuất hiện trong changes của các dòng (update: [cũ, mới]; delete/insert: giá trị trực tiếp). */
export function collectLookupIds(rows: AuditRow[]): number[] {
  const ids = new Set<number>()
  for (const r of rows) {
    for (const [k, v] of Object.entries(asObject(r.changes))) {
      if (!isLookupKey(k)) continue
      for (const x of r.action === 'update' || r.action === 'approve' || r.action === 'reject' ? (Array.isArray(v) ? v : []) : [v]) if (typeof x === 'number') ids.add(x)
    }
  }
  return [...ids]
}

export type AuditActor = { id: string; label: string }
/** Tài khoản admin/root cho dropdown "Người thao tác" (root đọc được mọi profile). Lỗi → danh sách rỗng. */
export function useAuditActors(): AuditActor[] {
  const [actors, setActors] = useState<AuditActor[]>([])
  useEffect(() => {
    void supabase.from('profiles').select('id, full_name, username, role').in('role', ['admin', 'root']).order('full_name')
      .then(({ data }) => setActors((data ?? []).map((p) => ({ id: p.id, label: `${p.full_name} (${p.username})` }))))
  }, [])
  return actors
}

/** Nhật ký thao tác (chỉ root): phân trang phía server, mới nhất trước, lọc theo ngày (giờ VN), người, hành động, đối tượng. */
export function useAuditLog(f: AuditFilters, page: number, size: number) {
  const key = JSON.stringify([f, page, size])
  const [state, setState] = useState<{ key: string; rows: AuditRow[]; total: number | null; names: Map<number, string>; error: string } | null>(null)
  const seq = useRef(0)
  const reload = useCallback(async () => {
    const mine = ++seq.current
    let q = supabase.from('audit_log').select('*', { count: 'exact' })
    if (f.from) q = q.gte('at', `${f.from}T00:00:00+07:00`)
    if (f.to) q = q.lte('at', `${f.to}T23:59:59.999+07:00`)
    if (f.actor) q = q.eq('actor_id', f.actor)
    if (f.action) q = q.eq('action', f.action)
    if (f.table) q = q.eq('table_name', f.table)
    const { data, error, count } = await q.order('at', { ascending: false }).order('id', { ascending: false }).range((page - 1) * size, page * size - 1)
    if (mine !== seq.current) return
    if (error) return setState({ key, rows: [], total: null, names: new Map(), error: errorMessage(error) })
    const rows = data ?? []
    const names = new Map<number, string>()
    const ids = collectLookupIds(rows)
    if (ids.length) {
      const res = await supabase.rpc('get_lookup_items', { p_ids: ids }) // một lần cho cả trang; lỗi thì hiện id thô
      for (const x of res.data ?? []) names.set(x.id, x.name)
      if (mine !== seq.current) return
    }
    setState({ key, rows, total: count ?? null, names, error: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key đã gói f/page/size
  }, [key])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- tải dữ liệu lần đầu, setState chạy sau await
  useEffect(() => { void reload() }, [reload])
  const fresh = state?.key === key ? state : null
  return { rows: fresh?.rows ?? [], total: fresh?.total ?? null, names: fresh?.names ?? new Map<number, string>(), error: fresh?.error ?? '', loading: !fresh, reload }
}
