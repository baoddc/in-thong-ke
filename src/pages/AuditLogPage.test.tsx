// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const row = (over: object) => ({
  id: 5, at: '2026-11-04T03:00:09Z', actor_id: 'a1', actor_name: 'Quản Trị', actor_role: 'admin', action: 'update', table_name: 'transport_plans',
  row_id: 10, label: 'TK2026/11-071', changes: { vehicle_id: [7, 8], note: [null, 'Giao gấp'] }, ...over,
})
const h = vi.hoisted(() => ({ rows: [] as unknown[], error: null as { message: string } | null, calls: [] as unknown[][], rpc: [] as [string, unknown][], restoreErr: null as { message: string } | null }))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const c: Record<string, unknown> = table === 'profiles'
        ? { then: (r: (v: unknown) => unknown) => r({ data: [{ id: 'a1', full_name: 'Quản Trị', username: 'quantri', role: 'admin' }], error: null }) }
        : { then: (r: (v: unknown) => unknown) => r({ data: h.error ? null : h.rows, error: h.error, count: h.rows.length }) }
      for (const m of ['select', 'order', 'range', 'eq', 'gte', 'lte', 'ilike', 'in']) c[m] = (...a: unknown[]) => { h.calls.push([m, ...a]); return c }
      return c
    },
    rpc: (fn: string, args: unknown) => {
      h.rpc.push([fn, args])
      if (fn === 'restore_audit') return Promise.resolve(h.restoreErr ? { data: null, error: h.restoreErr } : { data: 'Đã khôi phục phiếu TK2026/11-071', error: null })
      return Promise.resolve({ data: [{ id: 7, name: 'Xe 51C-111' }, { id: 8, name: 'Xe 51C-222' }], error: null })
    },
  },
}))

import AuditLogPageBare from './AuditLogPage'
import { ToastProvider } from '../components/ui/Toast'

const AuditLogPage = () => <ToastProvider><AuditLogPageBare /></ToastProvider>

beforeEach(() => { h.rows = [row({})]; h.error = null; h.restoreErr = null; h.calls.length = 0; h.rpc.length = 0 })
afterEach(cleanup)
beforeAll(() => { HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') } })

describe('AuditLogPage (T-085)', () => {
  it('hiện thời gian giờ VN có giây, người + vai trò, hành động, đối tượng, bản ghi; mới nhất trước', async () => {
    render(<AuditLogPage />)
    const r = within(await screen.findByTestId('audit-row-5'))
    expect(r.getByText('04/11/2026 10:00:09')).not.toBeNull()
    expect(r.getByText('Quản Trị')).not.toBeNull()
    expect(r.getByText('Admin')).not.toBeNull()
    expect(r.getByText('Sửa')).not.toBeNull()
    expect(r.getByText('Phiếu')).not.toBeNull()
    expect(r.getByText('TK2026/11-071')).not.toBeNull()
    expect(h.calls).toContainEqual(['order', 'at', { ascending: false }])
    expect(h.calls).toContainEqual(['order', 'id', { ascending: false }])
  })

  it('sửa: hiện "tên cột: cũ → mới" tiếng Việt, id danh mục tra tên qua get_lookup_items', async () => {
    render(<AuditLogPage />)
    const c = within(await screen.findByTestId('changes-5'))
    expect(c.getByText('Số xe:')).not.toBeNull()
    expect(c.getByText('Xe 51C-111')).not.toBeNull()
    expect(c.getByText('Xe 51C-222')).not.toBeNull()
    expect(c.getByText('Ghi chú:')).not.toBeNull()
    expect(c.getByText('(trống)')).not.toBeNull()
    expect(c.getByText('Giao gấp')).not.toBeNull()
    expect(h.rpc).toContainEqual(['get_lookup_items', { p_ids: [7, 8] }])
  })

  it('xóa: có mục "Xem dữ liệu đã xóa" chứa các cột của dòng cũ', async () => {
    h.rows = [row({ id: 6, action: 'delete', changes: { id: 10, warehouse_slip_no: 'AH26/10-333', note: null } })]
    render(<AuditLogPage />)
    await userEvent.click(await screen.findByText('Xem dữ liệu đã xóa'))
    const c = within(screen.getByTestId('changes-6'))
    expect(c.getByText('Số PXK:')).not.toBeNull()
    expect(c.getByText('AH26/10-333')).not.toBeNull()
    expect(c.queryByText('Ghi chú:')).toBeNull()
    expect(within(screen.getByTestId('audit-row-6')).getByText('Xóa')).not.toBeNull()
  })

  it('lọc theo hành động và người thao tác gửi lên máy chủ', async () => {
    render(<AuditLogPage />)
    await screen.findByTestId('audit-row-5')
    await userEvent.selectOptions(screen.getByTestId('filter-action'), 'delete')
    await screen.findByRole('option', { name: 'Quản Trị (quantri)' })
    await userEvent.selectOptions(screen.getByTestId('filter-actor'), 'Quản Trị (quantri)')
    await waitFor(() => expect(h.calls).toContainEqual(['eq', 'actor_id', 'a1']))
    expect(h.calls).toContainEqual(['in', 'role', ['admin', 'root']])
    expect(h.calls).toContainEqual(['eq', 'action', 'delete'])
  })

  it('nút Khôi phục chỉ hiện với sửa/xóa/ẩn trên bảng được hỗ trợ và chưa khôi phục', async () => {
    h.rows = [
      row({ id: 1 }), row({ id: 2, action: 'delete' }), row({ id: 3, action: 'archive', table_name: 'lookup_items' }),
      row({ id: 4, action: 'approve' }), row({ id: 5, action: 'reject' }), row({ id: 6, action: 'restore', changes: { from_log: 1 } }),
      row({ id: 7, table_name: 'edit_requests' }),
      row({ id: 8, restored_at: '2026-11-04T04:00:00Z', restored_by_name: 'Root A' }),
    ]
    render(<AuditLogPage />)
    await screen.findByTestId('audit-row-1')
    for (const id of [1, 2, 3]) expect(screen.queryByTestId(`restore-${id}`)).not.toBeNull()
    for (const id of [4, 5, 6, 7, 8]) expect(screen.queryByTestId(`restore-${id}`)).toBeNull()
    expect(screen.getByTestId('restored-8').textContent).toBe('Đã khôi phục · Root A · 04/11/2026 11:00:00')
    expect(screen.getByTestId('changes-6').textContent).toBe('Khôi phục từ nhật ký #1')
    expect(within(screen.getByTestId('audit-row-6')).getByText('Khôi phục')).not.toBeNull()
  })

  it('bấm Khôi phục + xác nhận gọi restore_audit đúng p_id, hiện toast và tải lại', async () => {
    h.rows = [row({ id: 12, action: 'delete' })]
    render(<AuditLogPage />)
    await userEvent.click(await screen.findByTestId('restore-12'))
    expect(screen.getByTestId('confirm-dialog').textContent).toContain('Tạo lại dữ liệu đã xóa')
    const before = h.calls.length
    await userEvent.click(screen.getByTestId('confirm-ok'))
    expect(await screen.findByTestId('toast-success')).not.toBeNull()
    expect(h.rpc).toContainEqual(['restore_audit', { p_id: 12 }])
    await waitFor(() => expect(h.calls.length).toBeGreaterThan(before))
  })

  it('khôi phục lỗi → toast lỗi nguyên văn từ máy chủ', async () => {
    h.restoreErr = { message: 'Hãy khôi phục thao tác mới hơn trước.' }
    render(<AuditLogPage />)
    await userEvent.click(await screen.findByTestId('restore-5'))
    await userEvent.click(screen.getByTestId('confirm-ok'))
    expect((await screen.findByTestId('toast-error')).textContent).toContain('Hãy khôi phục thao tác mới hơn trước.')
  })

  it('trống → thông báo; lỗi → thông báo tiếng Việt + nút Thử lại', async () => {
    h.rows = []
    render(<AuditLogPage />)
    expect((await screen.findByTestId('table-empty')).textContent).toContain('Chưa có thao tác nào')
    cleanup()
    h.error = { message: 'boom' }
    render(<AuditLogPage />)
    expect((await screen.findByTestId('page-error')).textContent).toContain('Có lỗi xảy ra')
    expect(screen.getByTestId('page-retry')).not.toBeNull()
  })
})
