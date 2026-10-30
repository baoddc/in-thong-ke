import { useCallback, useEffect, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Role } from './auth'

/** Người dùng do Edge Function `admin-users` trả về (docs/api-contract.md). */
export type AdminUser = {
  id: string
  username: string
  full_name: string
  role: Role
  is_active: boolean
  is_pending: boolean // D-015: tự đăng ký, chờ duyệt (khi đó is_active = false)
  created_at: string
  email: string | null
  last_sign_in_at: string | null
  // D-016 (thiếu khi máy chủ chưa cập nhật → coi như không có)
  created_by_name?: string | null
  approved_by_name?: string | null
  approved_at?: string | null
}

export type AdminAction =
  | { action: 'list' }
  | { action: 'preview_username'; full_name: string }
  | { action: 'create'; full_name: string; password: string; role: Role }
  | { action: 'update'; user_id: string; full_name?: string; role?: Role }
  | { action: 'set_active'; user_id: string; active: boolean }
  | { action: 'reset_password'; user_id: string; password: string }
  | { action: 'approve'; user_id: string }
  | { action: 'reject'; user_id: string }

/** Gọi Edge Function; lỗi → Error với thông báo tiếng Việt lấy từ body `{ error }` của function. */
export const callAdmin = <T>(body: AdminAction) => callFunction<T>('admin-users', body)

export async function callFunction<T>(name: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const msg = await error.context.json().then((b: { error?: string }) => b.error, () => undefined)
      throw new Error(msg || 'Máy chủ từ chối yêu cầu. Vui lòng thử lại.')
    }
    throw new Error('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')
  }
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') throw new Error(data.error)
  return data as T
}

export const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Có lỗi xảy ra. Vui lòng thử lại.')

/** Sự kiện báo số tài khoản chờ duyệt mới nhất (trang Quản lý người dùng → badge ở sidebar). */
const PENDING_EVENT = 'pending-users-count'
export const countPending = (users: AdminUser[]) => users.filter((u) => u.is_pending).length

/** Số tài khoản chờ duyệt cho badge sidebar (chỉ gọi khi `enabled`, tức admin/root); lỗi thì coi như 0. */
export function usePendingCount(enabled: boolean): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    callAdmin<AdminUser[]>({ action: 'list' }).then((u) => { if (alive) setCount(countPending(u)) }, () => {})
    const on = (e: Event) => setCount((e as CustomEvent<number>).detail)
    window.addEventListener(PENDING_EVENT, on)
    return () => { alive = false; window.removeEventListener(PENDING_EVENT, on) }
  }, [enabled])
  return enabled ? count : 0
}

export function useAdminUsers() {
  const [state, setState] = useState<{ users: AdminUser[]; error: string; loaded: boolean }>({ users: [], error: '', loaded: false })

  const reload = useCallback(async () => {
    try {
      const users = await callAdmin<AdminUser[]>({ action: 'list' })
      setState({ users, error: '', loaded: true })
      window.dispatchEvent(new CustomEvent(PENDING_EVENT, { detail: countPending(users) }))
    } catch (e) {
      setState((s) => ({ ...s, error: messageOf(e), loaded: true }))
    }
  }, [])

  useEffect(() => { void reload() }, [reload])
  return { users: state.users, error: state.error, loading: !state.loaded, reload }
}
