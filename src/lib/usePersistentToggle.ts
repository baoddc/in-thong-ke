import { useCallback, useState } from 'react'

const KEY = 'tk:ui:'

const read = (key: string): boolean | null => {
  try {
    const v = window.localStorage.getItem(KEY + key)
    return v === '1' ? true : v === '0' ? false : null
  } catch { return null } // localStorage bị chặn (chế độ riêng tư…) → dùng mặc định
}

/** Màn hình nhỏ (điện thoại): dùng để mặc định thu gọn bộ lọc. */
export const isSmallScreen = () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 639px)').matches

/**
 * Bật/tắt có nhớ trong localStorage theo `key`. Chưa có giá trị lưu → `getDefault()`; chỉ ghi khi người dùng đổi.
 * Trả về [giá trị, đặt giá trị, đảo giá trị].
 */
export function usePersistentToggle(key: string, getDefault: () => boolean = () => true) {
  const [value, setValue] = useState<boolean>(() => read(key) ?? getDefault())
  const set = useCallback((next: boolean) => {
    setValue(next)
    try { window.localStorage.setItem(KEY + key, next ? '1' : '0') } catch { /* bỏ qua: chỉ mất việc nhớ */ }
  }, [key])
  const toggle = useCallback(() => set(!value), [set, value])
  return [value, set, toggle] as const
}
