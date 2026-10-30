import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { errorMessage } from './format'

export const HOLD_SECONDS = 300 // D-018: giữ số 5 phút
const EXTEND_WHEN_LEFT = 60 // còn ≤ 60 giây mà người dùng đang thao tác → gia hạn
const ACTIVE_WITHIN_MS = 30_000

type Res = { data: string | null; error: { code?: string; message?: string } | null }
// shortcut: reserve/release chưa có trong src/types/database.ts (backend đang sinh lại), ép kiểu tạm; bỏ khi types có.
const rpc = (fn: 'reserve_tk_number' | 'release_tk_reservation') =>
  (supabase as unknown as { rpc: (fn: string) => PromiseLike<Res> }).rpc(fn)

// Giữ chỗ số phiếu TK cho form thêm phiếu. Trả: số đang giữ, giây còn lại, đã hết hạn chưa.
// touch(): gọi khi người dùng thao tác (để biết có nên gia hạn). markSaved(): đã lưu → không release khi đóng.
export function useTkReservation(enabled: boolean) {
  const [number, setNumber] = useState('')
  const [error, setError] = useState('')
  const [reservedAt, setReservedAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const stopped = useRef(true) // true: không còn giữ (đã release/đã lưu/chưa mở)
  const busy = useRef(false)
  const touched = useRef(0)
  const lastReserve = useRef(0)

  const reserve = useCallback(async () => {
    busy.current = true
    lastReserve.current = Date.now()
    try {
      const r = await rpc('reserve_tk_number')
      if (stopped.current) return
      if (r.error || !r.data) return setError(errorMessage(r.error ?? { message: 'không nhận được số phiếu' }))
      setError('')
      setNumber(r.data)
      const t = Date.now()
      setNow(t)
      setReservedAt(t)
    } catch (e) {
      if (!stopped.current) setError(errorMessage({ message: e instanceof Error ? e.message : undefined }))
    } finally {
      busy.current = false
    }
  }, [])

  const release = useCallback(() => {
    if (stopped.current) return
    stopped.current = true
    void Promise.resolve(rpc('release_tk_reservation')).then(() => {}, () => {}) // bỏ qua lỗi: chỗ giữ tự hết hạn
  }, [])

  useEffect(() => {
    if (!enabled) return
    stopped.current = false
    const first = setTimeout(() => void reserve(), 0)
    const timer = setInterval(() => {
      const t = Date.now()
      setNow(t)
      const left = HOLD_SECONDS - (t - lastReserve.current) / 1000
      if (!busy.current && left > 0 && left <= EXTEND_WHEN_LEFT && t - touched.current < ACTIVE_WITHIN_MS) void reserve()
    }, 1000)
    window.addEventListener('pagehide', release) // đóng tab: gửi release, có thể không kịp
    return () => {
      clearTimeout(first)
      clearInterval(timer)
      window.removeEventListener('pagehide', release)
      release()
    }
  }, [enabled, reserve, release])

  const touch = useCallback(() => { touched.current = Date.now() }, [])
  const markSaved = useCallback(() => { stopped.current = true }, [])
  const remaining = reservedAt ? Math.max(0, HOLD_SECONDS - Math.floor((now - reservedAt) / 1000)) : HOLD_SECONDS
  return { number, error, remaining, expired: reservedAt > 0 && remaining === 0, touch, markSaved }
}
