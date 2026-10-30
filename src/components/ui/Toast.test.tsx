// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_MS, ToastProvider, toastReducer, useToast } from './Toast'

function Buttons() {
  const toast = useToast()
  return (
    <>
      <button onClick={() => toast.success('Đã lưu')}>ok</button>
      <button onClick={() => toast.error('Lỗi mạng')}>loi</button>
    </>
  )
}
const setup = () => render(<ToastProvider><Buttons /></ToastProvider>)

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Toast', () => {
  it('thành công: role=status, tự ẩn sau 4 giây', () => {
    setup()
    fireEvent.click(screen.getByText('ok'))
    expect(screen.getByRole('status').textContent).toContain('Đã lưu')
    act(() => { vi.advanceTimersByTime(TOAST_MS - 1) })
    expect(screen.queryByTestId('toast-success')).not.toBeNull()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.queryByTestId('toast-success')).toBeNull()
  })

  it('lỗi: role=alert, không tự ẩn, đóng bằng nút', () => {
    setup()
    fireEvent.click(screen.getByText('loi'))
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(screen.getByRole('alert').textContent).toContain('Lỗi mạng')
    fireEvent.click(screen.getByLabelText('Đóng thông báo'))
    expect(screen.queryByTestId('toast-error')).toBeNull()
  })

  it('toast mới không làm đặt lại giờ ẩn của toast cũ', () => {
    setup()
    fireEvent.click(screen.getByText('ok'))
    act(() => { vi.advanceTimersByTime(3000) })
    fireEvent.click(screen.getByText('loi'))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.queryByTestId('toast-success')).toBeNull()
    expect(screen.queryByTestId('toast-error')).not.toBeNull()
  })

  it('reducer: thêm, xóa, chỉ giữ 4 toast mới nhất', () => {
    let s = toastReducer([], { type: 'add', toast: { id: 1, kind: 'success', message: 'a' } })
    for (let id = 2; id <= 6; id++) s = toastReducer(s, { type: 'add', toast: { id, kind: 'error', message: 'x' } })
    expect(s.map((t) => t.id)).toEqual([3, 4, 5, 6])
    expect(toastReducer(s, { type: 'remove', id: 4 }).map((t) => t.id)).toEqual([3, 5, 6])
  })
})
