// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.unmock('./dbChanges')
const handlers: Record<string, () => void> = {}
const removeChannel = vi.fn()
vi.mock('./supabase', () => ({
  supabase: {
    channel: () => {
      const ch = { on: (_e: string, f: { table: string }, cb: () => void) => { handlers[f.table] = cb; return ch }, subscribe: () => ch }
      return ch
    },
    removeChannel: (...a: unknown[]) => removeChannel(...a),
  },
}))

import { useDbChange } from './dbChanges'

afterEach(() => { vi.useRealTimers(); removeChannel.mockClear() })

describe('useDbChange (D-028)', () => {
  it('gom thay đổi dồn dập thành một lần, bỏ qua bảng không nghe, đóng kênh khi hết người nghe', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    const { unmount } = renderHook(() => useDbChange(['inspection_details'], cb, 400))
    act(() => { handlers.inspection_details(); handlers.inspection_details(); handlers.lookup_items() })
    expect(cb).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(400) })
    expect(cb).toHaveBeenCalledTimes(1)
    unmount()
    expect(removeChannel).toHaveBeenCalledTimes(1)
  })
})
