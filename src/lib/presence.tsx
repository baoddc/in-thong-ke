import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { recall } from './lookupSearch'
import { AVATAR_PATH_RX } from './avatar'
import { useProfile } from './useProfile'

/** D-024: ai đang làm gì. Chỉ để biết, không khóa; do client tự khai nên không dùng để phân quyền. */
export type Activity =
  | { kind: 'adding_plan'; tk: string; expiresAt: number }
  | { kind: 'editing_plan'; planId: number; tk: string }
  | { kind: 'adding_detail'; tk?: string }
  | { kind: 'editing_detail'; detailId: number; tk: string }
  | null

export type Peer = { key: string; userId: string; username: string; fullName: string; page: string; avatarPath: string | null; activity: Activity }
/** D-025: nháp dòng nhập phát qua broadcast (không lưu DB). values = chuỗi hiển thị theo khóa cột của bảng. */
export type DraftBody = { table: 'plans' | 'details'; values: Record<string, string>; expiresAt?: number; focus?: string }
export type Draft = DraftBody & { key: string; userId: string; username: string; fullName?: string; mode: 'add'; at: number }
type Ctx = { peers: Peer[]; selfKey: string; report: (owner: string, a: Activity) => void; setDraft: (owner: string, d: DraftBody | null) => void }

const Presence = createContext<Ctx>({ peers: [], selfKey: '', report: () => {}, setDraft: () => {} }) // ngoài provider (trang test): không làm gì
const DraftsCtx = createContext<Draft[]>([]) // tách riêng để trang/bảng không render lại mỗi lần người khác gõ

export const usePresence = () => useContext(Presence)
export const useDrafts = () => useContext(DraftsCtx)

// Payload từ người khác là dữ liệu không tin cậy: kiểm kiểu trước khi vào state; sai → bỏ qua.
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function parseActivity(v: unknown): { ok: boolean; value: Activity } {
  if (v === null) return { ok: true, value: null }
  if (!isObj(v)) return { ok: false, value: null }
  const bad = { ok: false, value: null }
  switch (v.kind) {
    case 'adding_plan': return isStr(v.tk) && isNum(v.expiresAt) ? { ok: true, value: { kind: v.kind, tk: v.tk, expiresAt: v.expiresAt } } : bad
    case 'editing_plan': return isNum(v.planId) && isStr(v.tk) ? { ok: true, value: { kind: v.kind, planId: v.planId, tk: v.tk } } : bad
    case 'adding_detail': return v.tk === undefined || isStr(v.tk) ? { ok: true, value: { kind: v.kind, tk: v.tk } } : bad
    case 'editing_detail': return isNum(v.detailId) && isStr(v.tk) ? { ok: true, value: { kind: v.kind, detailId: v.detailId, tk: v.tk } } : bad
    default: return bad
  }
}

export function parsePeer(key: string, v: unknown): Peer | null {
  if (!isObj(v) || !isStr(v.userId) || !isStr(v.username) || !isStr(v.fullName) || !isStr(v.page)) return null
  const a = parseActivity(v.activity)
  // Ảnh do người khác tự khai → chỉ nhận đường dẫn đúng mẫu VÀ nằm trong thư mục của chính người đó (không trỏ sang ảnh người khác / ra ngoài bucket)
  const avatarPath = isStr(v.avatarPath) && AVATAR_PATH_RX.test(v.avatarPath) && v.avatarPath.startsWith(`${v.userId}/`) ? v.avatarPath : null
  return a.ok ? { key, userId: v.userId, username: v.username, fullName: v.fullName, page: v.page, avatarPath, activity: a.value } : null
}

export function parseDraft(v: unknown): Draft | null {
  if (!isObj(v) || !isStr(v.key) || !isStr(v.userId) || !isStr(v.username)) return null
  if ((v.table !== 'plans' && v.table !== 'details') || v.mode !== 'add' || !isObj(v.values)) return null
  if (v.fullName !== undefined && !isStr(v.fullName)) return null
  if (v.focus !== undefined && !isStr(v.focus)) return null
  if (v.expiresAt !== undefined && !isNum(v.expiresAt)) return null
  const values: Record<string, string> = {}
  for (const [k, x] of Object.entries(v.values)) if (isStr(x) || isNum(x)) values[k] = String(x)
  return { key: v.key, userId: v.userId, username: v.username, fullName: v.fullName, table: v.table, mode: 'add', values, focus: v.focus, expiresAt: v.expiresAt, at: Date.now() }
}

/** Màu riêng ổn định cho mỗi người (theo userId): solid cho viền/nhãn (chữ trắng đủ tương phản), soft cho nền nhạt. */
const HUES = [210, 150, 280, 25, 330, 175, 50]
export function personColor(userId: string) {
  let h = 0
  for (const c of String(userId)) h = (h * 31 + c.charCodeAt(0)) >>> 0
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
      // private: server kiểm quyền qua policy realtime.messages (chỉ user đã đăng nhập, đang hoạt động); uid chỉ có khi đã có session nên JWT đã sẵn.
      ch = supabase.channel('presence:kho', { config: { private: true, presence: { key: `${uid}:${tabId}` } } })
      const c = ch
      c.on('presence', { event: 'sync' }, () => {
        const state = c.presenceState()
        setPeers(Object.entries(state).flatMap(([key, list]) => { const p = parsePeer(key, list?.[0]); return p ? [p] : [] }))
        setDrafts((s) => { // người đã rời presence → gỡ nháp
          const keys = Object.keys(s).filter((k) => k in state)
          return keys.length === Object.keys(s).length ? s : Object.fromEntries(keys.map((k) => [k, s[k]]))
        })
      })
      c.on('presence', { event: 'join' }, () => { if (myDrafts.current.size) flush() }) // người mới vào: gửi lại nháp hiện tại
      c.on('broadcast', { event: 'draft' }, ({ payload }: { payload?: unknown }) => {
        const k = isObj(payload) ? payload.key : undefined
        if (!isStr(k) || !k || k === `${uid}:${tabId}`) return
        const clear = isObj(payload) && payload.clear === true
        const draft = clear ? null : parseDraft(payload)
        if (!clear && !draft) return
        setDrafts((s) => {
          if (clear) {
            if (!(k in s)) return s
            const n = { ...s }
            delete n[k]
            return n
          }
          return draft ? { ...s, [k]: draft } : s
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
        void Promise.resolve(chRef.current?.track({ userId: profile.id, username: profile.username, fullName: profile.full_name ?? '', page: pathname, avatarPath: profile.avatar_path ?? null, activity: JSON.parse(activityJson) })).catch(() => {})
      } catch { /* bỏ qua */ }
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [ready, profile, pathname, activityJson])

  const value = useMemo(() => ({ peers, selfKey, report, setDraft }), [peers, selfKey, report, setDraft])
  const draftList = useMemo(() => Object.values(drafts), [drafts])
  return <Presence.Provider value={value}><DraftsCtx.Provider value={draftList}>{children}</DraftsCtx.Provider></Presence.Provider>
}
