import { useEffect, type RefObject } from 'react'

/** Đang gõ trong ô nhập/chọn thì không bắt phím tắt. */
export const isTyping = (el: EventTarget | null) =>
  el instanceof Element && !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')

/**
 * `N` mở form thêm, `/` nhảy tới ô tìm — chỉ khi không đang gõ và không có hộp thoại mở.
 * `onBeforeSearch` (vd mở bộ lọc đang ẩn) chạy trước; focus hoãn một nhịp để ô hiện ra đã.
 */
export function useShortcuts(onNew: () => void, searchRef: RefObject<HTMLInputElement>, onBeforeSearch?: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || isTyping(e.target) || document.querySelector('dialog[open]')) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); onNew() }
      else if (e.key === '/') {
        e.preventDefault()
        if (onBeforeSearch) { onBeforeSearch(); setTimeout(() => searchRef.current?.focus(), 0) } else searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onNew, searchRef, onBeforeSearch])
}
