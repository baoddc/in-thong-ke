import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useDbChange } from './dbChanges'

/** Ảnh đại diện của những người mình được xem trong `profiles` (admin: người dùng thường + chính mình): { user_id: avatar_path }. Chỉ người có ảnh. */
export function useAvatarPaths() {
  const [paths, setPaths] = useState<Record<string, string>>({})
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])
  useDbChange(['profiles'], reload, 1000) // D-028: có người đổi ảnh / người mới được duyệt

  useEffect(() => {
    let alive = true
    void supabase.from('profiles').select('id, avatar_path').not('avatar_path', 'is', null).limit(1000).then((r) => {
      if (alive && !r.error) setPaths(Object.fromEntries((r.data ?? []).flatMap((x) => (x.avatar_path ? [[x.id, x.avatar_path]] : []))))
    })
    return () => { alive = false }
  }, [tick])

  return { paths, reload }
}
