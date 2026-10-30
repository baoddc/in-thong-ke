// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Dòng phẳng như RPC list_transport_plans trả về (D-017)
const plan = {
  id: 1, tk_number: 'TK0001', export_date: '2026-10-01', transport_order_no: 'L1', transport_type_id: null,
  vehicle_id: null, driver_id: null, fg_exporter_id: null, note: null, transport_type_name: null, vehicle_name: null,
  driver_name: null, fg_exporter_name: null, material_exporters: [{ id: 12, name: 'Bình', sort_order: 1 }, { id: 11, name: 'An', sort_order: 0 }],
}
const calls: unknown[][] = [] // mọi lời gọi lên transport_plans (đếm/xóa), theo thứ tự
const rpcCalls: Record<string, unknown>[] = [] // tham số mỗi lần gọi list_transport_plans
const offsets = () => rpcCalls.map((a) => a.p_offset)
let total: number | undefined
let weightRpc: { data: unknown; error: { message: string } | null } = { data: 246043357.56, error: null }
let deleteData: unknown[] | null = null // kết quả `.delete().select()`; null: trả về phiếu (xóa được)
let editRows: unknown[] = [] // edit_requests của mình (D-019)
const editRpc: [string, unknown][] = [] // lời gọi request_plan_edit

// Mọi chuỗi gọi trả về chính nó và có thể await; ghi lại lời gọi để kiểm tra truy vấn phân trang.
vi.mock('../lib/supabase', () => {
  const chain = (t: string, data: unknown) => {
    const c: Record<string, unknown> = { then: (r: (v: unknown) => unknown) => r({ data: t === 'transport_plans' && deleteData && calls.some((x) => x[0] === 'delete') ? deleteData : data, error: null, count: t === 'transport_plans' ? total : undefined }) }
    for (const m of ['select', 'order', 'limit', 'range', 'eq', 'in', 'or', 'gte', 'lte', 'lt', 'delete']) c[m] = (...a: unknown[]) => { if (t === 'transport_plans') calls.push([m, ...a]); return c }
    return c
  }
  return {
    supabase: {
      from: (t: string) => chain(t, t === 'transport_plans' ? [plan] : t === 'edit_requests' ? editRows : []),
      rpc: (fn: string, args: Record<string, unknown>) => fn === 'request_plan_edit' ? (editRpc.push([fn, args]), Promise.resolve({ data: 7, error: null })) : fn === 'list_transport_plans' ? (rpcCalls.push(args), Promise.resolve({ data: [plan], error: null })) : fn === 'inspection_weight_total' ? Promise.resolve(weightRpc) : Promise.resolve({ data: fn === 'reserve_tk_number' ? 'TK0002' : { tk_number: 'TK0002' }, error: null }),
    },
  }
})

const me = { id: 'a1', role: 'admin', is_active: true }
vi.mock('../lib/useProfile', () => ({ useProfile: () => ({ profile: me, isAdmin: me.role === 'admin', loading: false, error: '' }) }))

import PlansPage from './PlansPage'
import { ToastProvider } from '../components/ui/Toast'
import { clearListCache } from '../lib/listCache'

const renderPage = (url = '/') => render(<MemoryRouter initialEntries={[url]}><ToastProvider><PlansPage /></ToastProvider></MemoryRouter>)

beforeAll(() => {
  // jsdom chưa có showModal/close → polyfill tối thiểu
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
})
beforeEach(() => { editRows = []; editRpc.length = 0; Object.assign(me, { id: 'a1', role: 'admin' }); Object.assign(plan, { created_by: null, created_at: '2026-10-01T00:00:00Z' }); deleteData = null; localStorage.clear(); clearListCache(); calls.length = 0; rpcCalls.length = 0; total = undefined; weightRpc = { data: 246043357.56, error: null } })
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

  it('phân trang phía server: trang 1 = limit 50 offset 0 qua RPC, thanh trang hiện tổng số dòng', async () => {
    total = 16500
    renderPage()
    await screen.findByTestId('plan-table')
    expect(rpcCalls[0]).toEqual({ p_q: null, p_from: null, p_to: null, p_sort: 'created_at', p_desc: true, p_limit: 50, p_offset: 0 })
    expect(calls).toContainEqual(['select', 'id', { count: 'exact', head: true }]) // đếm chính xác trên bảng gốc, chạy song song với RPC
    expect((screen.getByTestId('page-input') as HTMLInputElement).value).toBe('1')
    expect(screen.getByTestId('page-count').textContent).toBe('/330')
    expect(screen.getByTestId('page-total').textContent).toBe('· tổng 16.500 dòng')
    expect((screen.getByTestId('page-prev') as HTMLButtonElement).disabled).toBe(true)
  })

  it('đọc bộ lọc + trang từ URL và gửi lên server', async () => {
    total = 300
    renderPage('/?q=TK01&from=2026-10-01&page=2&size=25&sort=tk_number&dir=asc')
    await screen.findByTestId('plan-table')
    expect(calls).toContainEqual(['or', 'tk_number.ilike.%TK01%,transport_order_no.ilike.%TK01%']) // request đếm cùng bộ lọc
    expect(calls).toContainEqual(['gte', 'export_date', '2026-10-01'])
    expect(rpcCalls[0]).toEqual({ p_q: 'TK01', p_from: '2026-10-01', p_to: null, p_sort: 'tk_number', p_desc: false, p_limit: 25, p_offset: 25 })
    expect((screen.getByTestId('search') as HTMLInputElement).value).toBe('TK01')
    expect((screen.getByTestId('page-input') as HTMLInputElement).value).toBe('2')
    expect(screen.getByTestId('page-count').textContent).toBe('/12')
    expect(screen.getByTestId('page-total').textContent).toBe('· tổng 300 dòng')
  })

  it('gõ số trang rồi Enter để nhảy trang; số quá lớn bị chặn ở trang cuối', async () => {
    total = 300
    renderPage()
    await screen.findByTestId('plan-table')
    const input = screen.getByTestId('page-input')
    await userEvent.clear(input)
    await userEvent.type(input, '3{Enter}')
    await waitFor(() => expect(offsets()).toContain(100))
    await userEvent.clear(input)
    await userEvent.type(input, '999{Enter}')
    await waitFor(() => expect(offsets()).toContain(250))
  })

  it('bấm Trang sau tải trang kế (offset 50)', async () => {
    total = 120
    renderPage()
    await screen.findByTestId('plan-table')
    await userEvent.click(screen.getByTestId('page-next'))
    await waitFor(() => expect(offsets()).toContain(50))
  })

  it('prefetch: tải xong trang 1 thì tải sẵn trang 2; không prefetch khi đã là trang cuối', async () => {
    total = 120
    renderPage()
    await waitFor(() => expect(offsets()).toEqual([0, 50]))
    cleanup(); clearListCache(); rpcCalls.length = 0
    total = 40 // chỉ 1 trang
    renderPage()
    await screen.findByTestId('plan-table')
    await new Promise((r) => setTimeout(r, 20))
    expect(offsets()).toEqual([0])
  })

  it('cache: sang trang đã prefetch và quay lại trang đã xem hiện ngay, không gọi lại server', async () => {
    total = 120
    renderPage()
    await waitFor(() => expect(offsets()).toEqual([0, 50]))
    await userEvent.click(screen.getByTestId('page-next'))
    await waitFor(() => expect((screen.getByTestId('page-input') as HTMLInputElement).value).toBe('2'))
    await waitFor(() => expect(offsets()).toEqual([0, 50, 100])) // trang 2 lấy từ cache, chỉ prefetch tiếp trang 3
    await userEvent.click(screen.getByTestId('page-prev'))
    await waitFor(() => expect((screen.getByTestId('page-input') as HTMLInputElement).value).toBe('1'))
    expect(offsets()).toEqual([0, 50, 100]) // trang 1 từ cache, không có request mới
  })

  it('xóa phiếu → xóa cache: quay lại trang đã xem phải tải lại từ server', async () => {
    total = 120
    renderPage('/?page=2')
    await waitFor(() => expect(offsets()).toEqual([50, 100]))
    await userEvent.click(await screen.findByTestId('delete-TK0001'))
    await userEvent.click(screen.getByTestId('confirm-ok'))
    await screen.findByTestId('toast-success')
    await waitFor(() => expect(offsets()).toEqual([50, 100, 50, 100])) // tải lại trang 2 + prefetch lại trang 3 (cache 100 đã bị xóa)
    await userEvent.click(screen.getByTestId('page-prev'))
    await waitFor(() => expect(offsets()).toEqual([50, 100, 50, 100, 0])) // trang 1 không còn trong cache; trang 2 mới tải lại nên đã có sẵn
  })

  it('không có số đếm → chỉ "Trang x", nút Sau tắt vì trang chưa đầy', async () => {
    renderPage() // total undefined
    await screen.findByTestId('plan-table')
    expect(screen.queryByTestId('page-total')).toBeNull()
    expect((screen.getByTestId('page-next') as HTMLButtonElement).disabled).toBe(true)
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

  it('user không phải người tạo: Xóa bị khóa kèm giải thích, Sửa mở modal chỉ xem (không có nút Lưu)', async () => {
    Object.assign(me, { id: 'u2', role: 'user' })
    Object.assign(plan, { created_by: 'u1', created_at: new Date().toISOString() })
    renderPage()
    const del = (await screen.findByTestId('delete-TK0001')) as HTMLButtonElement
    expect(del.disabled).toBe(true)
    expect(del.title).toContain('Chỉ người tạo trong 24 giờ hoặc admin được sửa')
    await userEvent.click(screen.getByTestId('edit-TK0001'))
    expect(screen.getByText('Xem phiếu TK0001', { selector: 'h2' })).not.toBeNull()
    expect(screen.queryByTestId('plan-save')).toBeNull()
    expect(screen.getByTestId('order-no').matches(':disabled')).toBe(true) // fieldset disabled
  })

  it('người tạo trong 24 giờ được xóa; server xóa 0 dòng (RLS) → toast lỗi quyền, không báo thành công', async () => {
    Object.assign(me, { id: 'u1', role: 'user' })
    Object.assign(plan, { created_by: 'u1', created_at: new Date().toISOString() })
    deleteData = []
    renderPage()
    const del = (await screen.findByTestId('delete-TK0001')) as HTMLButtonElement
    expect(del.disabled).toBe(false)
    await userEvent.click(del)
    await userEvent.click(screen.getByTestId('confirm-ok'))
    expect((await screen.findByTestId('toast-error')).textContent).toContain('Bạn không có quyền xóa phiếu TK0001')
    expect(screen.queryByTestId('toast-success')).toBeNull()
  })

  describe('Yêu cầu sửa phiếu quá 24 giờ (D-019)', () => {
    const old = () => { Object.assign(me, { id: 'u1', role: 'user' }); Object.assign(plan, { created_by: 'u1', created_at: '2026-10-01T00:00:00Z' }) }

    it('phiếu của mình quá 24 giờ: hiện "Yêu cầu sửa"; nhập lý do → gọi request_plan_edit; để trống thì báo lỗi cạnh ô', async () => {
      old()
      renderPage()
      await userEvent.click(await screen.findByTestId('request-edit-TK0001'))
      await userEvent.click(screen.getByTestId('edit-request-modal-submit'))
      expect(screen.getByRole('alert').textContent).toContain('Vui lòng nhập lý do')
      expect(editRpc).toEqual([])
      await userEvent.type(screen.getByTestId('edit-request-modal-text'), 'Sai số xe')
      await userEvent.click(screen.getByTestId('edit-request-modal-submit'))
      expect((await screen.findByTestId('toast-success')).textContent).toContain('Đã gửi yêu cầu sửa phiếu TK0001')
      expect(editRpc).toEqual([['request_plan_edit', { p_plan_id: 1, p_reason: 'Sai số xe' }]])
      expect(screen.queryByTestId('edit-request-modal')).toBeNull()
    })

    it('phiếu của người khác hoặc admin: không có nút "Yêu cầu sửa"', async () => {
      old()
      Object.assign(plan, { created_by: 'u2' })
      renderPage()
      await screen.findByTestId('edit-TK0001')
      expect(screen.queryByTestId('request-edit-TK0001')).toBeNull()
      cleanup()
      Object.assign(me, { id: 'a1', role: 'admin' })
      renderPage()
      await screen.findByTestId('edit-TK0001')
      expect(screen.queryByTestId('request-edit-TK0001')).toBeNull()
    })

    it('đang chờ duyệt: badge "Chờ duyệt", không cho gửi lại', async () => {
      old()
      editRows = [{ plan_id: 1, status: 'pending', unlock_until: null }]
      renderPage()
      expect((await screen.findByTestId('edit-pending-TK0001')).textContent).toBe('Chờ duyệt')
      expect(screen.queryByTestId('request-edit-TK0001')).toBeNull()
    })

    it('đã duyệt còn hạn: Sửa mở được form (có nút Lưu), hiện hạn, Xóa vẫn tắt', async () => {
      old()
      editRows = [{ plan_id: 1, status: 'approved', unlock_until: new Date(Date.now() + 3_600_000).toISOString() }]
      renderPage()
      expect((await screen.findByTestId('edit-unlocked-TK0001')).textContent).toContain('Sửa đến')
      expect((screen.getByTestId('delete-TK0001') as HTMLButtonElement).disabled).toBe(true)
      expect(screen.queryByTestId('request-edit-TK0001')).toBeNull()
      await userEvent.click(screen.getByTestId('edit-TK0001'))
      expect(screen.getByText('Sửa phiếu TK0001', { selector: 'h2' })).not.toBeNull()
      expect(screen.getByTestId('plan-save')).not.toBeNull()
    })

    it('đã duyệt nhưng hết hạn: coi như chưa mở, cho yêu cầu lại', async () => {
      old()
      editRows = [{ plan_id: 1, status: 'approved', unlock_until: new Date(Date.now() - 1000).toISOString() }]
      renderPage()
      expect(await screen.findByTestId('request-edit-TK0001')).not.toBeNull()
      expect(screen.queryByTestId('edit-unlocked-TK0001')).toBeNull()
    })
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
