import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { isAdminRole, type Profile } from './auth'

/** `isAdmin` = admin hoặc root (D-014); `isRoot` chỉ root. */
export type ProfileState = { profile: Profile | null; isAdmin: boolean; isRoot: boolean; loading: boolean; error: string }

const Ctx = createContext<ProfileState>({ profile: null, isAdmin: false, isRoot: false, loading: true, error: '' })

/** Đọc profiles của người đang đăng nhập một lần (cache trong provider, theo id phiên). Đặt trong App khi đã có phiên. */
export function ProfileProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [state, setState] = useState<{ userId: string; profile: Profile | null; error: string } | null>(null)

  useEffect(() => {
    let alive = true
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle().then((r) => {
      if (alive) setState({ userId, profile: (r.data as Profile | null) ?? null, error: r.error?.message ?? '' })
    })
    return () => { alive = false }
  }, [userId])

  const value = useMemo<ProfileState>(() => {
    const done = state?.userId === userId
    const profile = done ? state.profile : null
    const active = !!profile?.is_active
    return { profile, isAdmin: active && isAdminRole(profile?.role), isRoot: active && profile?.role === 'root', loading: !done, error: done ? state.error : '' }
  }, [state, userId])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useProfile = (): ProfileState => useContext(Ctx)
