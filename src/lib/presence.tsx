import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { recall } from './lookupSearch'
import { useProfile } from './useProfile'

/** D-024: ai đang làm gì. Chỉ để biết, không khóa; do client tự khai nên không dùng để phân quyền. */
export type Activity =
  | { kind: 'adding_plan'; tk: string; expiresAt: number }
  | { kind: 'editing_plan'; planId: number; tk: string }
  | { kind: 'adding_detail'; tk?: string }
  | { kind: 'editing_detail'; detailId: number; tk: string }
  | null

export type Peer = { key: string; userId: string; username: string; fullName: string; page: string; activity: Activity }
/** D-025: nháp dòng nhập phát qua broadcast (không lưu DB). values = chuỗi hiển thị theo khóa cột của bảng. */
export type DraftBody = { table: 'plans' | 'details'; values: Record<string, string>; expiresAt?: number; focus?: string }
export type Draft = DraftBody & { key: string; userId: string; username: string; fullName?: string; mode: 'add'; at: number }
type Ctx = { peers: Peer[]; selfKey: string; report: (owner: string, a: Activity) => void; setDraft: (owner: string, d: DraftBody | null) => void }

const Presence = createContext<Ctx>({ peers: [], selfKey: '', report: () => {}, setDraft: () => {} }) // ngoài provider (trang test): không làm gì
const DraftsCtx = createContext<Draft[]>([]) // tách riêng để trang/bảng không render lại mỗi lần người khác gõ

export const usePresence = () => useContext(Presence)
export const useDrafts = () => useContext(DraftsCtx)

/** Màu riêng ổn định cho mỗi người (theo userId): solid cho viền/nhãn (chữ trắng đủ tương phản), soft cho nền nhạt. */
const HUES = [210, 150, 280, 25, 330, 175, 50]
export function personColor(userId: string) {
  let h = 0
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const hue = HUES[h % HUES.length]
  return { solid: `hsl(${hue} 70% 32%)`, soft: `hsl(${hue} 90% 96%)` }
}

/** Tên hiển thị của id danh mục: danh mục đã tải sẵn hoặc bộ nhớ đệm các lần tìm phía server. */
export const lookupName = (items: { id: number; name: string }[], kind: string, id: number | null) =>
  id === null ? '' : (items.find((i) => i.id === id)?.name ?? recall(kind, id)?.name ?? '')

/** Dòng nhập báo nháp của mình cho người khác thấy; null/unmount → gửi xóa. */
export function useShareDraft(body: DraftBody | null) {
  const { setDraft } = usePresence()
  const owner = useId()
  const json = JSON.stringify(body)
  useEffect(() => {
    setDraft(owner, JSON.parse(json) as DraftBody | null)
    return () => setDraft(owner, null)
  }, [json, owner, setDraft])
}

/** Mỗi nơi (dòng nhập, modal) báo hoạt động của mình; đóng/unmount thì tự về null. */
export function useReportActivity(activity: Activity) {
  const { report } = usePresence()
  const owner = useId()
  const json = JSON.stringify(activity)
  useEffect(() => {
    report(owner, JSON.parse(json) as Activity)
    return () => report(owner, null)
  }, [json, owner, report])
}

export function describeActivity(a: Activity): string {
  if (!a) return ''
  switch (a.kind) {
    case 'adding_plan': return `đang thêm phiếu${a.tk ? ` · giữ ${a.tk}` : ''}`
    case 'editing_plan': return `đang sửa ${a.tk}`
    case 'adding_detail': return `đang nhập bảng kiểm${a.tk ? ` ${a.tk}` : ''}`
    case 'editing_detail': return `đang sửa dòng bảng kiểm ${a.tk}`
  }
}

const DEBOUNCE_MS = 200
const DRAFT_THROTTLE_MS = 200
const DRAFT_KEEPALIVE_MS = 20_000
const DRAFT_STALE_MS = 60_000

/** Một kênh Presence chung cho người đã đăng nhập. Lỗi/không kết nối → danh sách rỗng, giao diện tự ẩn. */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { profile } = useProfile()
  const { pathname } = useLocation()
  const [tabId] = useState(() => Math.random().toString(36).slice(2, 10))
  const [peers, setPeers] = useState<Peer[]>([])
  const [ready, setReady] = useState(false)
  const [activity, setActivity] = useState<Activity>(null)
  const owners = useRef(new Map<string, Activity>())
  const chRef = useRef<RealtimeChannel | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const myDrafts = useRef(new Map<string, DraftBody>())
  const sent = useRef(false) // đã gửi nháp (để biết có cần gửi "xóa")
  const readyRef = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const who = useRef({ key: '', userId: '', username: '', fullName: '' })
  const uid = profile?.id
  const selfKey = uid ? `${uid}:${tabId}` : ''
  useEffect(() => { who.current = { key: selfKey, userId: uid ?? '', username: profile?.username ?? '', fullName: profile?.full_name ?? '' } }, [selfKey, uid, profile?.username, profile?.full_name])

  const report = useMemo(() => (owner: string, a: Activity) => {
    if (a) owners.current.set(owner, a); else owners.current.delete(owner)
    setActivity([...owners.current.values()].pop() ?? null) // nhiều nơi cùng báo: lấy cái báo sau cùng
  }, [])

  /** Gửi bản nháp cuối của mình (hoặc "xóa" nếu vừa gửi mà nay không còn). Lỗi kênh → bỏ qua. */
  const flush = useCallback(() => {
    timer.current = null
    const ch = chRef.current
    if (!ch || !readyRef.current || !who.current.key) return
    const body = [...myDrafts.current.values()].pop()
    if (!body && !sent.current) return
    sent.current = !!body
    const { key, userId, username, fullName } = who.current
    const payload = body ? { key, userId, username, fullName, mode: 'add', ...body } : { key, clear: true }
    try { void Promise.resolve(ch.send({ type: 'broadcast', event: 'draft', payload })).catch(() => {}) } catch { /* bỏ qua */ }
  }, [])

  const setDraft = useCallback((owner: string, d: DraftBody | null) => {
    if (d) myDrafts.current.set(owner, d); else myDrafts.current.delete(owner)
    if (!timer.current) timer.current = setTimeout(flush, DRAFT_THROTTLE_MS) // gửi tối đa ~5 lần/giây, luôn là bản cuối
  }, [flush])

  useEffect(() => {
    if (!uid) return
    let ch: RealtimeChannel | null = null
    try {
      ch = supabase.channel('presence:kho', { config: { presence: { key: `${uid}:${tabId}` } } })
      const c = ch
      c.on('presence', { event: 'sync' }, () => {
        const state = c.presenceState<Omit<Peer, 'key'>>()
        setPeers(Object.entries(state).flatMap(([key, list]) => (list[0] ? [{ ...list[0], key }] : [])))
        setDrafts((s) => { // người đã rời presence → gỡ nháp
          const keys = Object.keys(s).filter((k) => k in state)
          return keys.length === Object.keys(s).length ? s : Object.fromEntries(keys.map((k) => [k, s[k]]))
        })
      })
      c.on('presence', { event: 'join' }, () => { if (myDrafts.current.size) flush() }) // người mới vào: gửi lại nháp hiện tại
      c.on('broadcast', { event: 'draft' }, ({ payload }: { payload?: Partial<Draft> & { clear?: boolean } }) => {
        const k = payload?.key
        if (!k || k === `${uid}:${tabId}`) return
        setDrafts((s) => {
          if (payload.clear) {
            if (!(k in s)) return s
            const n = { ...s }
            delete n[k]
            return n
          }
          return { ...s, [k]: { ...(payload as Draft), at: Date.now() } }
        })
      })
      c.subscribe((status: string) => { if (status === 'SUBSCRIBED') { readyRef.current = true; setReady(true); flush() } })
      chRef.current = c
    } catch { /* không kết nối được: bỏ qua, chỉ mất tính năng xem người khác */ }
    // Gửi lại định kỳ để người khác không gỡ nháp "quá cũ"; tự gỡ nháp không cập nhật > 60 giây (tab treo).
    const keepAlive = setInterval(() => { if (myDrafts.current.size) flush() }, DRAFT_KEEPALIVE_MS)
    const prune = setInterval(() => setDrafts((s) => {
      const keys = Object.keys(s).filter((k) => Date.now() - s[k].at < DRAFT_STALE_MS)
      return keys.length === Object.keys(s).length ? s : Object.fromEntries(keys.map((k) => [k, s[k]]))
    }), 10_000)
    return () => {
      clearInterval(keepAlive)
      clearInterval(prune)
      if (timer.current) clearTimeout(timer.current)
      flush() // gửi "xóa" nháp còn lại trước khi đóng kênh
      readyRef.current = false
      setReady(false)
      setPeers([])
      setDrafts({})
      chRef.current = null
      if (ch) {
        try { void Promise.resolve(ch.untrack()).catch(() => {}) } catch { /* bỏ qua */ }
        void supabase.removeChannel(ch)
      }
    }
  }, [uid, tabId, flush])

  const activityJson = JSON.stringify(activity)
  useEffect(() => {
    if (!ready || !profile) return
    const t = setTimeout(() => {
      try {
        void Promise.resolve(chRef.current?.track({ userId: profile.id, username: profile.username, fullName: profile.full_name ?? '', page: pathname, activity: JSON.parse(activityJson) })).catch(() => {})
      } catch { /* bỏ qua */ }
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [ready, profile, pathname, activityJson])

  const value = useMemo(() => ({ peers, selfKey, report, setDraft }), [peers, selfKey, report, setDraft])
  const draftList = useMemo(() => Object.values(drafts), [drafts])
  return <Presence.Provider value={value}><DraftsCtx.Provider value={draftList}>{children}</DraftsCtx.Provider></Presence.Provider>
}
