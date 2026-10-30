// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const row = (over: object) => ({
  id: 1, plan_id: 10, requested_by: 'u1', reason: 'Sai số xe', status: 'pending', decided_by: null, decided_at: null, decision_note: null,
  unlock_until: null, created_at: '2026-10-30T03:00:00Z', updated_at: '2026-10-30T03:00:00Z', plan: { tk_number: 'TK0010', export_date: '2026-10-29' }, ...over,
})
const h = vi.hoisted(() => ({ rows: [] as unknown[], error: null as { message: string } | null, eq: [] as unknown[][], rpc: [] as [string, unknown][] }))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => {
      const c: Record<string, unknown> = { then: (r: (v: unknown) => unknown) => r({ data: h.error ? null : h.rows, error: h.error, count: h.rows.length }) }
      for (const m of ['select', 'order', 'range', 'eq']) c[m] = (...a: unknown[]) => { if (m === 'eq') h.eq.push(a); return c }
      return c
    },
    rpc: (fn: string, args: unknown) => {
      h.rpc.push([fn, args])
      return Promise.resolve({ data: fn === 'get_user_names' ? [{ id: 'u1', full_name: 'Lê Thái Bão', username: 'bao.lt' }, { id: 'a1', full_name: 'Quản Trị', username: 'admin' }] : null, error: null })
    },
  },
}))

import EditRequestsPage from './EditRequestsPage'
import { ToastProvider } from '../components/ui/Toast'

const renderPage = () => render(<ToastProvider><EditRequestsPage /></ToastProvider>)
const decide = () => h.rpc.filter(([fn]) => fn === 'decide_edit_request').map(([, a]) => a)

beforeAll(() => { HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
beforeEach(() => { h.rows = [row({})]; h.error = null; h.eq.length = 0; h.rpc.length = 0 })
afterEach(cleanup)

describe('EditRequestsPage (D-019)', () => {
  it('mặc định lọc Chờ duyệt; hiện số phiếu, tên người yêu cầu (qua get_user_names), lý do, giờ VN', async () => {
    renderPage()
    const r = within(await screen.findByTestId('request-row-1'))
    expect(r.getByText('TK0010')).not.toBeNull()
    expect(r.getByText('Lê Thái Bão')).not.toBeNull()
    expect(r.getByText('Sai số xe')).not.toBeNull()
    expect(r.getByText('30/10/2026 10:00')).not.toBeNull()
    expect(h.eq).toContainEqual(['status', 'pending'])
    expect(h.rpc).toContainEqual(['get_user_names', { p_ids: ['u1'] }])
  })

  it('Duyệt: mở hộp thoại, gọi decide_edit_request(p_approve true, ghi chú trống → null), báo thành công', async () => {
    renderPage()
    await userEvent.click(await screen.findByTestId('approve-1'))
    await userEvent.click(screen.getByTestId('decide-modal-submit'))
    expect((await screen.findByTestId('toast-success')).textContent).toContain('Đã duyệt')
    expect(decide()).toEqual([{ p_id: 1, p_approve: true, p_note: null }])
  })

  it('Từ chối kèm ghi chú → p_approve false, p_note là ghi chú', async () => {
    renderPage()
    await userEvent.click(await screen.findByTestId('reject-1'))
    await userEvent.type(screen.getByTestId('decide-modal-text'), 'Không hợp lệ')
    await userEvent.click(screen.getByTestId('decide-modal-submit'))
    await screen.findByTestId('toast-success')
    expect(decide()).toEqual([{ p_id: 1, p_approve: false, p_note: 'Không hợp lệ' }])
  })

  it('đã duyệt: hiện người duyệt, ghi chú, hạn mở; không còn nút Duyệt/Từ chối. Chọn "Tất cả" bỏ lọc trạng thái', async () => {
    h.rows = [row({ status: 'approved', decided_by: 'a1', decided_at: '2026-10-30T04:00:00Z', decision_note: 'OK', unlock_until: '2026-10-31T04:00:00Z' })]
    renderPage()
    const r = within(await screen.findByTestId('request-row-1'))
    expect(r.getByText(/Quản Trị/).textContent).toContain('30/10/2026 11:00')
    expect(r.getByText('OK')).not.toBeNull()
    expect(r.getByText('31/10/2026 11:00')).not.toBeNull()
    expect(screen.queryByTestId('approve-1')).toBeNull()
    h.eq.length = 0
    await userEvent.click(screen.getByTestId('filter-all'))
    await waitFor(() => expect(screen.getByTestId('filter-all').getAttribute('aria-pressed')).toBe('true'))
    await screen.findByTestId('request-row-1')
    expect(h.eq.some((a) => a[0] === 'status')).toBe(false)
  })

  it('trống → thông báo; lỗi → thông báo tiếng Việt + nút Thử lại', async () => {
    h.rows = []
    renderPage()
    expect((await screen.findByTestId('table-empty')).textContent).toContain('Không có yêu cầu nào chờ duyệt')
    cleanup()
    h.error = { message: 'boom' }
    renderPage()
    expect((await screen.findByTestId('page-error')).textContent).toContain('Có lỗi xảy ra')
    expect(screen.getByTestId('page-retry')).not.toBeNull()
  })

  it('yêu cầu sửa dòng bảng kiểm: nhãn "Dòng bảng kiểm", TK + PXK + ngày xuất; hộp thoại ghi rõ dòng', async () => {
    h.rows = [row({ plan_id: null, detail_id: 9, plan: null, detail: { tk_number: 'TK0010', warehouse_slip_no: '123', export_date: '2026-10-29' } })]
    renderPage()
    const r = within(await screen.findByTestId('request-row-1'))
    expect(r.getByTestId('kind-1').textContent).toBe('Dòng bảng kiểm')
    expect(r.getByText('TK0010')).not.toBeNull()
    expect(r.getByText('PXK 123 · 29/10/2026')).not.toBeNull()
    await userEvent.click(screen.getByTestId('approve-1'))
    expect(screen.getByText('Duyệt yêu cầu sửa dòng bảng kiểm TK0010 / PXK 123?')).not.toBeNull()
  })})
