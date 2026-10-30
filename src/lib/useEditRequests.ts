import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { errorMessage, formatShortDateTime } from './format'
import type { Database } from '../types/database'

const CHANGED = 'edit-requests-changed' // báo badge sidebar, trang Yêu cầu sửa và nút Sửa tải lại
/** Phát khi yêu cầu sửa đổi (tự duyệt/từ chối hoặc nhận từ Realtime) để mọi chỗ đang hiển thị tải lại. */
export const notifyEditRequestsChanged = () => window.dispatchEvent(new Event(CHANGED))

export type EditStatus = Database['public']['Tables']['edit_requests']['Row']['status']
type Target = {
  plan?: { tk_number: string; export_date: string | null } | null
  detail?: { tk_number: string | null; warehouse_slip_no: string | null; export_date: string | null } | null
}
// shortcut: database.ts chưa có detail_id (migration 000015) nên khai báo tay plan_id/detail_id; bỏ Omit khi sinh lại kiểu.
export type EditRequest = Omit<Database['public']['Tables']['edit_requests']['Row'], 'plan_id'> & Target & {
  plan_id: number | null // đúng một trong plan_id / detail_id
  detail_id: number | null
  requester_name: string // tên lấy qua get_user_names (admin không đọc được profiles của admin/root)
  decider_name: string
}

/** "phiếu TK0001" hoặc "dòng bảng kiểm TK0001 / PXK 123" — đối tượng của yêu cầu, dùng trong tiêu đề và thông báo. */
export function targetLabel(r: Target): string {
  if (r.detail) return `dòng bảng kiểm ${[r.detail.tk_number, r.detail.warehouse_slip_no && `PXK ${r.detail.warehouse_slip_no}`].filter(Boolean).join(' / ')}`.trim()
  return `phiếu ${r.plan?.tk_number ?? ''}`.trim()
}

type Err = { code?: string; message?: string }
/** Lỗi RPC: thông báo tiếng Việt do máy chủ tự `raise` (P0001/P0002) hiện nguyên văn; còn lại đổi theo errorMessage. */
const rpcError = (e: Err) => (e.code === 'P0001' || e.code === 'P0002') && e.message ? e.message : errorMessage(e)

export async function requestPlanEdit(planId: number, reason: string) {
  const { error } = await supabase.rpc('request_plan_edit', { p_plan_id: planId, p_reason: reason })
  if (error) throw new Error(rpcError(error))
}

export async function requestDetailEdit(detailId: number, reason: string) {
  // shortcut: RPC chưa có trong database.ts (migration 000015) → gọi qua kiểu rộng; bỏ ép kiểu khi sinh lại kiểu.
  const client = supabase as unknown as { rpc: (fn: string, args: object) => PromiseLike<{ error: Err | null }> }
  const { error } = await client.rpc('request_detail_edit', { p_detail_id: detailId, p_reason: reason })
  if (error) throw new Error(rpcError(error))
}

export async function decideEditRequest(id: number, approve: boolean, note: string) {
  const { error } = await supabase.rpc('decide_edit_request', { p_id: id, p_approve: approve, p_note: note.trim() || null })
  if (error) throw new Error(rpcError(error))
  notifyEditRequestsChanged()
}

export type Unlock = { status: EditStatus; unlock_until: string | null }

/** "14:05 30/10" từ thời điểm hết hạn mở khóa. */
export function untilLabel(iso: string | null | undefined): string {
  const s = formatShortDateTime(iso) // "30/10 14:05"
  return s && `${s.slice(6)} ${s.slice(0, 5)}`
}

/** Yêu cầu CỦA MÌNH còn hiệu lực: đang chờ, hoặc đã duyệt còn hạn → Map plan_id / detail_id → trạng thái. Lỗi thì coi như không có (không chặn trang). */
export function useMyEditRequests(userId: string | undefined) {
  const [state, setState] = useState<{ plans: Map<number, Unlock>; details: Map<number, Unlock> }>({ plans: new Map(), details: new Map() })
  const reload = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase.from('edit_requests').select('*').eq('requested_by', userId).in('status', ['pending', 'approved'])
    if (error) return
    const now = Date.now()
    const plans = new Map<number, Unlock>()
    const details = new Map<number, Unlock>()
    for (const r of (data ?? []) as unknown as Pick<EditRequest, 'plan_id' | 'detail_id' | 'status' | 'unlock_until'>[]) {
      if (r.status === 'approved' && !(Date.parse(r.unlock_until ?? '') > now)) continue
      const [map, id] = r.detail_id ? [details, r.detail_id] as const : [plans, r.plan_id] as const
      if (id && map.get(id)?.status !== 'approved') map.set(id, { status: r.status, unlock_until: r.unlock_until })
    }
    setState({ plans, details })
  }, [userId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- tải dữ liệu lần đầu, setState chạy sau await
  useEffect(() => { void reload() }, [reload])
  useEffect(() => {
    window.addEventListener(CHANGED, reload)
    return () => window.removeEventListener(CHANGED, reload)
  }, [reload])
  /** unlock_until của phiếu nếu đã được duyệt (còn hạn), không thì null. */
  const unlockOf = (planId: number | null | undefined) => {
    const u = planId ? state.plans.get(planId) : undefined
    return u?.status === 'approved' ? u.unlock_until : null
  }
  /** Dòng bảng kiểm: mở khóa muộn nhất của chính dòng và phiếu chứa nó (D-020). */
  const unlockOfLine = (detailId: number, planId: number | null | undefined) => {
    const d = state.details.get(detailId)
    const a = d?.status === 'approved' ? d.unlock_until : null
    const b = unlockOf(planId)
    return a && b ? (Date.parse(a) > Date.parse(b) ? a : b) : a ?? b
  }
  return { unlocks: state.plans, detailUnlocks: state.details, unlockOf, unlockOfLine, reload }
}

/** Trang admin: danh sách yêu cầu phân trang phía server, lọc theo trạng thái ('' = tất cả). Tự tải lại khi có thay đổi (Realtime). */
export function useEditRequestList(status: EditStatus | '', page: number, size: number) {
  const key = `${status}|${page}|${size}`
  const [state, setState] = useState<{ key: string; rows: EditRequest[]; total: number | null; error: string } | null>(null)
  const seq = useRef(0)
  const reload = useCallback(async () => {
    const mine = ++seq.current
    let q = supabase.from('edit_requests').select('*, plan:transport_plans(tk_number, export_date), detail:inspection_details(tk_number, warehouse_slip_no, export_date)', { count: 'exact' })
    if (status) q = q.eq('status', status)
    const { data: raw, error, count } = await q.order('created_at', { ascending: false }).range((page - 1) * size, page * size - 1)
    if (mine !== seq.current) return // đã có lần tải mới hơn
    if (error) return setState({ key, rows: [], total: null, error: errorMessage(error) })
    const data = (raw ?? []) as unknown as Omit<EditRequest, 'requester_name' | 'decider_name'>[] // shortcut: embed detail chưa có trong database.ts
    const ids = [...new Set(data.flatMap((r) => (r.decided_by ? [r.requested_by, r.decided_by] : [r.requested_by])))]
    const names = new Map<string, string>()
    if (ids.length) {
      const res = await supabase.rpc('get_user_names', { p_ids: ids }) // một lần cho cả trang; lỗi thì để trống tên
      for (const u of res.data ?? []) names.set(u.id, u.full_name || u.username)
      if (mine !== seq.current) return
    }
    const rows = data.map((r) => ({ ...r, requester_name: names.get(r.requested_by) ?? '', decider_name: (r.decided_by && names.get(r.decided_by)) || '' }))
    setState({ key, rows, total: count ?? null, error: '' })
  }, [status, page, size, key])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- tải dữ liệu lần đầu, setState chạy sau await
  useEffect(() => { void reload() }, [reload])
  useEffect(() => {
    window.addEventListener(CHANGED, reload)
    return () => window.removeEventListener(CHANGED, reload)
  }, [reload])
  const fresh = state?.key === key ? state : null
  return { rows: fresh?.rows ?? [], total: fresh?.total ?? null, error: fresh?.error ?? '', loading: !fresh, reload }
}

/** Số yêu cầu đang chờ duyệt cho badge sidebar (chỉ admin/root); tải lại khi có thay đổi. Lỗi thì coi như 0. */
export function useEditPendingCount(enabled: boolean): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = () => {
      supabase.from('edit_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
        .then((r) => { if (alive && !r.error) setCount(r.count ?? 0) }, () => {})
    }
    load()
    window.addEventListener(CHANGED, load)
    return () => { alive = false; window.removeEventListener(CHANGED, load) }
  }, [enabled])
  return enabled ? count : 0
}
