// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Cb = (p: unknown) => void
const h = vi.hoisted(() => ({
  cb: null as null | ((p: unknown) => void), opts: null as unknown, subscribed: 0, removed: 0,
  label: { plan: { tk_number: 'TK0007' }, detail: null } as unknown,
}))
vi.mock('./supabase', () => ({
  supabase: {
    channel: (name: string) => {
      const ch = { name, on: (_t: string, o: unknown, cb: Cb) => { h.opts = o; h.cb = cb; return ch }, subscribe: () => { h.subscribed++; return ch } }
      return ch
    },
    removeChannel: () => { h.removed++ },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: h.label, error: null }) }) }) }),
  },
}))

import { useEditRequestNotices } from './useEditRequestNotices'
import { ToastProvider } from '../components/ui/Toast'

function Probe({ uid, admin = false }: { uid: string | undefined; admin?: boolean }) {
  useEditRequestNotices(uid, admin)
  return null
}
const mount = (uid: string | undefined = 'u1', admin = false) => render(<ToastProvider><Probe uid={uid} admin={admin} /></ToastProvider>)
const push = (p: unknown) => act(async () => { h.cb?.(p) })
let reloads = 0
const onChanged = () => { reloads++ }

beforeEach(() => { h.cb = null; h.opts = null; h.subscribed = 0; h.removed = 0; h.label = { plan: { tk_number: 'TK0007' }, detail: null }; reloads = 0; window.addEventListener('edit-requests-changed', onChanged) })
afterEach(() => { cleanup(); window.removeEventListener('edit-requests-changed', onChanged) })

describe('useEditRequestNotices (D-020)', () => {
  it('user: nghe UPDATE của chính mình; hủy đăng ký khi unmount; không đăng nhập thì không nghe', () => {
    const { unmount } = mount()
    expect(h.opts).toEqual({ event: 'UPDATE', schema: 'public', table: 'edit_requests', filter: 'requested_by=eq.u1' })
    expect(h.subscribed).toBe(1)
    unmount()
    expect(h.removed).toBe(1)
    cleanup()
    h.cb = null
    render(<ToastProvider><Probe uid={undefined} /></ToastProvider>)
    expect(h.cb).toBeNull()
  })

  it('được duyệt phiếu → toast có số phiếu + hạn mở (giờ VN) và báo tải lại', async () => {
    mount()
    await push({ eventType: 'UPDATE', new: { id: 1, requested_by: 'u1', status: 'approved', unlock_until: '2026-10-31T07:05:00Z', decision_note: null } })
    expect((await screen.findByTestId('toast-success')).textContent).toContain('Yêu cầu sửa phiếu TK0007 đã được duyệt, sửa được đến 14:05 31/10')
    expect(reloads).toBe(1)
  })

  it('được duyệt dòng bảng kiểm → nhãn có TK và PXK', async () => {
    h.label = { plan: null, detail: { tk_number: 'TK0007', warehouse_slip_no: '123' } }
    mount()
    await push({ eventType: 'UPDATE', new: { id: 2, requested_by: 'u1', status: 'approved', unlock_until: '2026-10-31T07:05:00Z' } })
    expect((await screen.findByTestId('toast-success')).textContent).toContain('Yêu cầu sửa dòng bảng kiểm TK0007 / PXK 123 đã được duyệt')
  })

  it('bị từ chối → toast lỗi kèm ghi chú; không ghi chú thì chỉ báo bị từ chối', async () => {
    mount()
    await push({ eventType: 'UPDATE', new: { id: 1, requested_by: 'u1', status: 'rejected', decision_note: 'Không hợp lệ' } })
    expect((await screen.findByTestId('toast-error')).textContent).toContain('Yêu cầu sửa phiếu TK0007 bị từ chối: Không hợp lệ')
    await push({ eventType: 'UPDATE', new: { id: 3, requested_by: 'u1', status: 'rejected', decision_note: null } })
    expect((await screen.findAllByTestId('toast-error'))[1].textContent).not.toContain(':')
  })

  it('admin: nghe mọi thay đổi; INSERT của người khác → toast nhỏ; UPDATE của người khác chỉ tải lại, không toast', async () => {
    mount('a1', true)
    expect(h.opts).toEqual({ event: '*', schema: 'public', table: 'edit_requests' })
    await push({ eventType: 'INSERT', new: { id: 5, requested_by: 'u1', status: 'pending' } })
    expect((await screen.findByTestId('toast-success')).textContent).toContain('Có yêu cầu sửa mới')
    await push({ eventType: 'UPDATE', new: { id: 5, requested_by: 'u1', status: 'approved' } })
    expect(screen.getAllByTestId('toast-success')).toHaveLength(1)
    expect(reloads).toBe(2)
  })
})