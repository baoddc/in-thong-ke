// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const plan = {
  id: 1, tk_number: 'TK0001', export_date: '2026-10-01', transport_order_no: 'L1', transport_type_id: null,
  vehicle_id: null, driver_id: null, fg_exporter_id: null, note: null, transport_type: null, vehicle: null,
  driver: null, fg_exporter: null, material_exporters: [{ lookup: { id: 11, name: 'An' } }, { lookup: { id: 12, name: 'Bình' } }],
}
const calls: unknown[][] = [] // mọi lời gọi lên transport_plans, theo thứ tự
let total: number | undefined
let weightRpc: { data: unknown; error: { message: string } | null } = { data: 246043357.56, error: null }

// Mọi chuỗi gọi trả về chính nó và có thể await; ghi lại lời gọi để kiểm tra truy vấn phân trang.
vi.mock('../lib/supabase', () => {
  const chain = (t: string, data: unknown) => {
    const c: Record<string, unknown> = { then: (r: (v: unknown) => unknown) => r({ data, error: null, count: t === 'transport_plans' ? total : undefined }) }
    for (const m of ['select', 'order', 'limit', 'range', 'eq', 'in', 'or', 'gte', 'lte', 'lt', 'delete']) c[m] = (...a: unknown[]) => { if (t === 'transport_plans') calls.push([m, ...a]); return c }
    return c
  }
  return {
    supabase: {
      from: (t: string) => chain(t, t === 'transport_plans' ? [plan] : []),
      rpc: (fn: string) => fn === 'inspection_weight_total' ? Promise.resolve(weightRpc) : Promise.resolve({ data: fn === 'next_tk_number' ? 'TK0002' : { tk_number: 'TK0002' }, error: null }),
    },
  }
})

import PlansPage from './PlansPage'
import { ToastProvider } from '../components/ui/Toast'

const renderPage = (url = '/') => render(<MemoryRouter initialEntries={[url]}><ToastProvider><PlansPage /></ToastProvider></MemoryRouter>)

beforeAll(() => {
  // jsdom chưa có showModal/close → polyfill tối thiểu
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
})
beforeEach(() => { localStorage.clear(); calls.length = 0; total = undefined; weightRpc = { data: 246043357.56, error: null } })
afterEach(cleanup)

describe('PlansPage', () => {
  it('hiện bảng, NV xuất VT nối bằng ", "; Thêm phiếu mở modal có số xem trước', async () => {
    renderPage()
    expect((await screen.findByTestId('plan-table')).textContent).toContain('An, Bình')
    expect(screen.queryByTestId('plan-modal')).toBeNull()
    await userEvent.click(screen.getByTestId('add-plan'))
    expect(screen.getByTestId('plan-modal').hasAttribute('open')).toBe(true)
    expect(screen.getByText('Thêm phiếu', { selector: 'h2' })).not.toBeNull()
    await waitFor(() => expect((screen.getByTestId('tk-number') as HTMLInputElement).value).toBe('TK0002'))
  })

  it('Sửa mở modal đổ sẵn dữ liệu; Hủy khi chưa đổi thì đóng không hỏi', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    renderPage()
    await userEvent.click(await screen.findByTestId('edit-TK0001'))
    expect(screen.getByText('Sửa phiếu TK0001', { selector: 'h2' })).not.toBeNull()
    expect((screen.getByTestId('order-no') as HTMLInputElement).value).toBe('L1')
    await userEvent.click(screen.getByTestId('plan-cancel'))
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.queryByTestId('plan-modal')).toBeNull()
  })

  it('đã sửa form mà Hủy → hỏi xác nhận, từ chối thì giữ modal', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage()
    await userEvent.click(await screen.findByTestId('add-plan'))
    await userEvent.type(screen.getByTestId('order-no'), 'x')
    await userEvent.click(screen.getByTestId('plan-cancel'))
    expect(confirm).toHaveBeenCalledWith('Bỏ các thay đổi chưa lưu?')
    expect(screen.queryByTestId('plan-modal')).not.toBeNull()
  })

  it('phân trang phía server: trang 1 = range(0,49), thanh trang hiện tổng số dòng', async () => {
    total = 16500
    renderPage()
    await screen.findByTestId('plan-table')
    expect(calls).toContainEqual(['range', 0, 49])
    expect(calls).toContainEqual(['select', expect.any(String), { count: 'estimated' }]) // D-012: không đếm chính xác
    expect(calls).toContainEqual(['order', 'id', { ascending: false }]) // khóa phụ cùng chiều (created_at giảm dần)
    expect(screen.getByTestId('page-info').textContent).toBe('Trang 1/330 · khoảng 16.500 dòng')
    expect((screen.getByTestId('page-prev') as HTMLButtonElement).disabled).toBe(true)
  })

  it('đọc bộ lọc + trang từ URL và gửi lên server', async () => {
    total = 300
    renderPage('/?q=TK01&from=2026-10-01&page=2&size=25&sort=tk_number&dir=asc')
    await screen.findByTestId('plan-table')
    expect(calls).toContainEqual(['or', 'tk_number.ilike.%TK01%,transport_order_no.ilike.%TK01%'])
    expect(calls).toContainEqual(['gte', 'export_date', '2026-10-01'])
    expect(calls).toContainEqual(['range', 25, 49])
    expect((screen.getByTestId('search') as HTMLInputElement).value).toBe('TK01')
    expect(screen.getByTestId('page-info').textContent).toBe('Trang 2/12 · tổng 300 dòng')
  })

  it('bấm Trang sau tải trang kế (range 50..99)', async () => {
    total = 120
    renderPage()
    await screen.findByTestId('plan-table')
    await userEvent.click(screen.getByTestId('page-next'))
    await waitFor(() => expect(calls).toContainEqual(['range', 50, 99]))
  })

  it('Xóa mở hộp thoại xác nhận riêng (không dùng window.confirm), Hủy thì không xóa', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    renderPage()
    await userEvent.click(await screen.findByTestId('delete-TK0001'))
    expect(screen.getByTestId('confirm-dialog').textContent).toContain('Xóa phiếu TK0001?')
    await userEvent.click(screen.getByTestId('confirm-cancel'))
    expect(screen.queryByTestId('confirm-dialog')).toBeNull()
    expect(calls.some((c) => c[0] === 'delete')).toBe(false)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('xác nhận xóa → gọi delete và hiện toast thành công', async () => {
    renderPage()
    await userEvent.click(await screen.findByTestId('delete-TK0001'))
    await userEvent.click(screen.getByTestId('confirm-ok'))
    expect((await screen.findByTestId('toast-success')).textContent).toContain('Đã xóa phiếu TK0001')
    expect(calls).toContainEqual(['delete'])
  })

  it('thẻ Tổng khối lượng tháng này hiện số kiểu VN', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('stat-weight').textContent).toContain('246.043.357,56'))
    expect(screen.getByTestId('stat-weight').textContent).toContain('Tổng khối lượng tháng này (kg)')
  })

  it('RPC tổng khối lượng lỗi → thẻ hiện "—" kèm title lỗi, 2 thẻ kia vẫn hiện số', async () => {
    weightRpc = { data: null, error: { message: 'function not found' } }
    renderPage()
    await waitFor(() => expect(screen.getByTestId('stat-weight').getAttribute('title')).toBe('function not found'))
    expect(screen.getByTestId('stat-weight').textContent).toContain('—')
    expect(screen.getByTestId('stat-plans').textContent).toContain('0')
    expect(screen.getByTestId('stat-plans').textContent).not.toContain('—')
  })

  it('phím N mở modal thêm khi không đang gõ', async () => {
    renderPage()
    await screen.findByTestId('plan-table')
    await userEvent.keyboard('n')
    expect(screen.getByTestId('plan-modal').hasAttribute('open')).toBe(true)
  })

  it('ẩn/hiện số liệu và bộ lọc, nhớ trạng thái trong localStorage', async () => {
    const { unmount } = renderPage()
    await screen.findByTestId('plan-table')
    const stats = screen.getByTestId('toggle-stats')
    expect(stats.getAttribute('aria-expanded')).toBe('true')
    expect(stats.getAttribute('aria-controls')).toBe('plans-stats')
    expect(screen.getByTestId('stats-panel').dataset.state).toBe('open')
    await userEvent.click(stats)
    expect(screen.getByTestId('stats-panel').dataset.state).toBe('closed')
    expect(stats.getAttribute('aria-expanded')).toBe('false')
    expect(stats.textContent).toBe('Hiện số liệu')
    expect(screen.getByTestId('filters-panel').dataset.state).toBe('open') // khối kia không đổi
    expect(localStorage.getItem('tk:ui:plans:stats')).toBe('0')
    unmount()
    renderPage() // mở lại trang → vẫn ẩn
    expect(screen.getByTestId('stats-panel').dataset.state).toBe('closed')
    await userEvent.click(screen.getByTestId('toggle-stats'))
    expect(screen.getByTestId('stats-panel').dataset.state).toBe('open')
    expect(localStorage.getItem('tk:ui:plans:stats')).toBe('1')
  })

  it('bộ lọc đang ẩn mà còn điều kiện: nút hiện số bộ lọc + Xóa lọc; phím / mở lại và focus ô tìm', async () => {
    renderPage('/?q=TK01&from=2026-10-01')
    await screen.findByTestId('plan-table')
    expect(screen.queryByTestId('clear-filters-hidden')).toBeNull() // đang hiện → không cần
    await userEvent.click(screen.getByTestId('toggle-filters'))
    expect(screen.getByTestId('filters-panel').dataset.state).toBe('closed')
    expect(screen.getByTestId('toggle-filters').textContent).toContain('Bộ lọc (2)')
    expect(screen.getByTestId('toggle-filters-badge').textContent).toBe('2')
    expect(screen.getByTestId('toggle-filters').getAttribute('aria-label')).toBe('Hiện bộ lọc (2 đang bật)')
    expect(screen.getByTestId('clear-filters-hidden')).not.toBeNull()
    await userEvent.keyboard('/')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('search')))
    expect(screen.getByTestId('filters-panel').dataset.state).toBe('open')
    expect(screen.queryByTestId('clear-filters-hidden')).toBeNull()
  })

  it('Xóa lọc khi bộ lọc ẩn bỏ hết điều kiện và badge biến mất', async () => {
    localStorage.setItem('tk:ui:plans:filters', '0')
    renderPage('/?q=TK01')
    await screen.findByTestId('plan-table')
    await userEvent.click(screen.getByTestId('clear-filters-hidden'))
    await waitFor(() => expect(screen.queryByTestId('clear-filters-hidden')).toBeNull())
    expect(screen.getByTestId('toggle-filters').textContent).toBe('Hiện bộ lọc')
  })})
