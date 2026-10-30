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
  created_at: string
  email: string | null
  last_sign_in_at: string | null
}

export type AdminAction =
  | { action: 'list' }
  | { action: 'preview_username'; full_name: string }
  | { action: 'create'; full_name: string; password: string; role: Role }
  | { action: 'update'; user_id: string; full_name?: string; role?: Role }
  | { action: 'set_active'; user_id: string; active: boolean }
  | { action: 'reset_password'; user_id: string; password: string }

/** Gọi Edge Function; lỗi → Error với thông báo tiếng Việt lấy từ body `{ error }` của function. */
export async function callAdmin<T>(body: AdminAction): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
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

export function useAdminUsers() {
  const [state, setState] = useState<{ users: AdminUser[]; error: string; loaded: boolean }>({ users: [], error: '', loaded: false })

  const reload = useCallback(async () => {
    try {
      const users = await callAdmin<AdminUser[]>({ action: 'list' })
      setState({ users, error: '', loaded: true })
    } catch (e) {
      setState((s) => ({ ...s, error: messageOf(e), loaded: true }))
    }
  }, [])

  useEffect(() => { void reload() }, [reload])
  return { users: state.users, error: state.error, loading: !state.loaded, reload }
}
