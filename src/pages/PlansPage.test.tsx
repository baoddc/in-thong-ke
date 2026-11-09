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
const calls: unknown[][] = [] // mọi lời gọi lên transport_plans (xóa...), theo thứ tự
const countCalls: Record<string, unknown>[] = [] // tham số mỗi lần gọi count_transport_plans (D-021)
let countError = false
const rpcCalls: Record<string, unknown>[] = [] // tham số mỗi lần gọi list_transport_plans
const offsets = () => rpcCalls.map((a) => a.p_offset)
let total: number | undefined
let weightRpc: { data: unknown; error: { message: string } | null } = { data: 246043357.56, error: null }
let deleteData: unknown[] | null = null // kết quả `.delete().select()`; null: trả về phiếu (xóa được)
let deleteError: { code: string } | null = null // lỗi của `.delete()` (23503: phiếu còn dòng bảng kiểm)
let lineCount: number | null = null // số dòng bảng kiểm của phiếu (đếm khi xóa lỗi 23503)
const navigateSpy = vi.fn()
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigateSpy }))
let editRows: unknown[] = [] // edit_requests của mình (D-019)
const editRpc: [string, unknown][] = [] // lời gọi request_plan_edit
const rpcLog: [string, unknown][] = [] // lời gọi reserve/release/create (dòng nhập, D-023)
type PresencePayload = { username: string; activity: { kind: string; tk: string; expiresAt: number } | null }
const tracks: PresencePayload[] = [] // payload mỗi lần track Presence
const rpcOf =(fn: string) => rpcLog.filter((c) => c[0] === fn)
let rpcFail = false // create_transport_plan trả lỗi

// Mọi chuỗi gọi trả về chính nó và có thể await; ghi lại lời gọi để kiểm tra truy vấn phân trang.
vi.mock('../lib/supabase', () => {
  const chain = (t: string, data: unknown) => {
    const c: Record<string, unknown> = {
      then: (r: (v: unknown) => unknown) => {
        const deleted = t === 'transport_plans' && calls.some((x) => x[0] === 'delete') // tính lúc await (sau khi delete được gọi)
        return r({ data: deleted && deleteData ? deleteData : data, error: deleted ? deleteError : null, count: t === 'transport_plans' ? total : t === 'inspection_details' ? lineCount : undefined })
      },
    }
    for (const m of ['select', 'order', 'limit', 'range', 'eq', 'in', 'or', 'gte', 'lte', 'lt', 'delete']) c[m] = (...a: unknown[]) => { if (t === 'transport_plans') calls.push([m, ...a]); return c }
    return c
  }
  return {
    supabase: {
      channel: () => { const ch = { on: () => ch, subscribe: (cb: (s: string) => void) => { cb('SUBSCRIBED'); return ch }, track: (p: PresencePayload) => { tracks.push(p); return Promise.resolve('ok') }, untrack: () => Promise.resolve('ok') }; return ch }, // Presence (D-024)
      removeChannel: () => {},
      from: (t: string) => chain(t, t === 'transport_plans' ? [plan] : t === 'edit_requests' ? editRows : []),
      rpc: (fn: string, args: Record<string, unknown>) => fn === 'release_tk_reservation' || fn === 'create_transport_plan' || fn === 'update_transport_plan' || fn === 'reserve_tk_number' ? (rpcLog.push([fn, args]), Promise.resolve({ data: fn === 'create_transport_plan' ? { tk_number: 'TK0002' } : fn === 'reserve_tk_number' ? 'TK0002' : null, error: rpcFail && fn === 'create_transport_plan' ? { message: 'boom' } : null })) : fn === 'request_plan_edit' ? (editRpc.push([fn, args]), Promise.resolve({ data: 7, error: null })) : fn === 'count_transport_plans' ? (countCalls.push(args), Promise.resolve(countError ? { data: null, error: { message: 'boom' } } : { data: total ?? null, error: null })) : fn === 'list_transport_plans' ? (rpcCalls.push(args), Promise.resolve({ data: [plan], error: null })) : fn === 'inspection_weight_total' ? Promise.resolve(weightRpc) : Promise.resolve({ data: fn === 'reserve_tk_number' ? 'TK0002' : { tk_number: 'TK0002' }, error: null }),
    },
  }
})

const me = { id: 'a1', role: 'admin', is_active: true, username: 'a.admin', full_name: 'Admin' }
vi.mock('../lib/useProfile', () => ({ useProfile: () => ({ profile: me, isAdmin: me.role === 'admin', loading: false, error: '' }) }))

import PlansPage from './PlansPage'
import { ToastProvider } from '../components/ui/Toast'
import { clearListCache } from '../lib/listCache'
import { PresenceProvider } from '../lib/presence'

const renderPage = (url = '/?from=&to=') => render(<MemoryRouter initialEntries={[url]}><ToastProvider><PlansPage /></ToastProvider></MemoryRouter>)

beforeAll(() => {
  // jsdom chưa có showModal/close → polyfill tối thiểu
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
})
const realMatchMedia = window.matchMedia
const narrow = () => { window.matchMedia = ((q: string) => ({ matches: true, media: q })) as unknown as typeof window.matchMedia } // < md: Thêm mở modal
beforeEach(() => { deleteError = null; lineCount = null; navigateSpy.mockClear(); tracks.length = 0; rpcLog.length = 0; rpcFail = false; editRows = []; editRpc.length = 0; Object.assign(me, { id: 'a1', role: 'admin' }); Object.assign(plan, { created_by: null, created_at: '2026-10-01T00:00:00Z' }); deleteData = null; localStorage.clear(); clearListCache(); calls.length = 0; rpcCalls.length = 0; countCalls.length = 0; countError = false; total = undefined; weightRpc = { data: 246043357.56, error: null } })
afterEach(() => { cleanup(); window.matchMedia = realMatchMedia })

describe('PlansPage', () => {
  it('màn rộng: bảng, NV xuất VT nối bằng ", "', async () => {
    renderPage()
    const table = await screen.findByTestId('plan-table')
    expect(table.tagName).toBe('TABLE')
    expect(table.textContent).toContain('An, Bình')
  })

  it('màn nhỏ: dạng thẻ hiện đủ mọi trường (số TK, thao tác, NV xuất VT, ghi chú, người tạo); Thêm phiếu mở modal có số xem trước', async () => {
    narrow()
    renderPage()
    const cards = await screen.findByTestId('plan-table')
    expect(cards.tagName).toBe('DIV')
    expect(cards.querySelector('table')).toBeNull()
    expect(cards.textContent).toContain('TK0001')
    for (const label of ['NV xuất VT', 'Ghi chú', 'Người tạo / sửa']) expect(cards.textContent).toContain(label) // người dùng: hiện đầy đủ thông tin
    expect(screen.getByTestId('delete-TK0001')).not.toBeNull()
    expect(screen.queryByTestId('plan-modal')).toBeNull()
    await userEvent.click(screen.getByTestId('add-plan'))
    expect(screen.getByTestId('plan-modal').hasAttribute('open')).toBe(true)
    expect(screen.getByText('Thêm phiếu', { selector: 'h2' })).not.toBeNull()
    await waitFor(() => expect((screen.getByTestId('tk-number') as HTMLInputElement).value).toBe('TK0002'))
  })

  it('màn nhỏ: Sửa mở modal đổ sẵn dữ liệu; Hủy khi chưa đổi thì đóng không hỏi', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    narrow()
    renderPage()
    await userEvent.click(await screen.findByTestId('edit-TK0001'))
    expect(screen.getByText('Sửa phiếu TK0001', { selector: 'h2' })).not.toBeNull()
    expect((screen.getByTestId('order-no') as HTMLInputElement).value).toBe('L1')
    await userEvent.click(screen.getByTestId('plan-cancel'))
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.queryByTestId('plan-modal')).toBeNull()
  })

  it('D-030: cột Thao tác là cột đầu; ≥ md bấm Sửa → chính dòng thành ô nhập (không modal); Esc về dòng thường; Lưu gọi update_transport_plan đúng id', async () => {
    renderPage()
    await userEvent.click(await screen.findByTestId('edit-TK0001'))
    expect(screen.queryByTestId('plan-modal')).toBeNull()
    const headers = [...screen.getByTestId('plan-table').querySelectorAll('thead th')].map((h) => h.textContent)
    expect(headers[0]).toContain('Thao tác')
    expect(headers[1]).toContain('Số phiếu TK')
    const row = screen.getByTestId('plan-edit-row')
    expect(row.parentElement!.children).toHaveLength(1) // dòng thường của TK0001 đã được thay thế
    expect((screen.getByTestId('inline-tk-number') as HTMLInputElement).value).toBe('TK0001')
    expect((screen.getByTestId('inline-order-no') as HTMLInputElement).value).toBe('L1')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('plan-edit-row')).toBeNull()
    expect(screen.getByTestId('edit-TK0001')).not.toBeNull()
    await userEvent.click(screen.getByTestId('edit-TK0001'))
    await userEvent.type(screen.getByTestId('inline-order-no'), '9')
    await userEvent.click(screen.getByTestId('plan-edit-row-save'))
    expect((await screen.findByTestId('toast-success')).textContent).toContain('Đã cập nhật phiếu TK0001')
    expect(rpcOf('update_transport_plan')[0][1]).toMatchObject({ p_id: 1, p_transport_order_no: 'L19' })
    expect(screen.queryByTestId('plan-edit-row')).toBeNull()
  })

  it('đã sửa form mà Hủy → hỏi xác nhận, từ chối thì giữ modal', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    narrow()
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
    expect(countCalls[0]).toEqual({ p_q: null, p_from: null, p_to: null }) // đếm qua RPC, cùng bộ lọc, chạy song song với RPC dữ liệu
    expect((screen.getByTestId('page-input') as HTMLInputElement).value).toBe('1')
    expect(screen.getByTestId('page-count').textContent).toBe('/330')
    expect(screen.getByTestId('page-total').textContent).toBe('· tổng 16.500 dòng')
    expect((screen.getByTestId('page-prev') as HTMLButtonElement).disabled).toBe(true)
  })

  it('T-073: không có ngày trên URL → mặc định hôm nay (giờ VN); Xóa bộ lọc → xem tất cả, không bị đặt lại; URL có ngày khác → giữ', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-31T18:00:00Z')) // 01/11/2026 01:00 giờ VN
    try {
      renderPage('/')
      await screen.findByTestId('plan-table')
      expect(rpcCalls[0]).toMatchObject({ p_from: '2026-11-01', p_to: '2026-11-01' })
      expect(countCalls[0]).toMatchObject({ p_from: '2026-11-01', p_to: '2026-11-01' })
      expect((screen.getByTestId('filter-from') as HTMLInputElement).value).toBe('01/11/2026')
      await userEvent.click(screen.getByTestId('clear-filters'))
      await waitFor(() => expect(rpcCalls[rpcCalls.length - 1]).toMatchObject({ p_from: null, p_to: null }))
      expect(screen.queryByTestId('clear-filters')).toBeNull()
      cleanup(); rpcCalls.length = 0; clearListCache()
      renderPage('/?from=2026-10-05&to=2026-10-06')
      await screen.findByTestId('plan-table')
      expect(rpcCalls[0]).toMatchObject({ p_from: '2026-10-05', p_to: '2026-10-06' })
    } finally { vi.useRealTimers() }
  })

  it('T-074: nút Hôm nay đặt from=to=hôm nay (giờ VN), giữ bộ lọc khác, aria-pressed đúng', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-31T18:00:00Z'))
    try {
      renderPage('/?q=TK01&from=&to=')
      await screen.findByTestId('plan-table')
      const btn = screen.getByTestId('filter-today')
      expect(btn.getAttribute('aria-pressed')).toBe('false')
      await userEvent.click(btn)
      await waitFor(() => expect(rpcCalls[rpcCalls.length - 1]).toMatchObject({ p_q: 'TK01', p_from: '2026-11-01', p_to: '2026-11-01' }))
      expect(countCalls[countCalls.length - 1]).toMatchObject({ p_q: 'TK01', p_from: '2026-11-01', p_to: '2026-11-01' })
      expect(screen.getByTestId('filter-today').getAttribute('aria-pressed')).toBe('true')
    } finally { vi.useRealTimers() }
  })

  it('đọc bộ lọc + trang từ URL và gửi lên server', async () => {
    total = 300
    renderPage('/?q=TK01&from=2026-10-01&page=2&size=25&sort=tk_number&dir=asc')
    await screen.findByTestId('plan-table')
    expect(countCalls[0]).toEqual({ p_q: 'TK01', p_from: '2026-10-01', p_to: null }) // request đếm cùng bộ lọc
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

  it('lỗi RPC đếm → vẫn hiện dòng, chỉ "Trang x" không có tổng', async () => {
    countError = true
    renderPage()
    expect((await screen.findByTestId('plan-table')).textContent).toContain('TK0001')
    expect(countCalls.length).toBeGreaterThan(0)
    expect(screen.queryByTestId('page-total')).toBeNull()
    expect(screen.queryByTestId('page-count')).toBeNull()
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

  it('xóa phiếu còn dòng bảng kiểm (lỗi 23503): báo số dòng và chuyển thẳng sang Bảng kiểm đã lọc theo số TK, không lọc ngày', async () => {
    deleteError = { code: '23503' }
    lineCount = 3
    renderPage()
    await userEvent.click(await screen.findByTestId('delete-TK0001'))
    await userEvent.click(screen.getByTestId('confirm-ok'))
    expect((await screen.findByTestId('toast-error')).textContent).toContain('còn 3 dòng bảng kiểm')
    expect(navigateSpy).toHaveBeenCalledWith('/bang-kiem?q=TK0001&from=&to=')
    expect(screen.queryByTestId('toast-success')).toBeNull()
  })

  it('lỗi ràng buộc nhưng không có dòng bảng kiểm nào (do bảng khác): giữ thông báo lỗi cũ, không chuyển trang', async () => {
    deleteError = { code: '23503' }
    lineCount = 0
    renderPage()
    await userEvent.click(await screen.findByTestId('delete-TK0001'))
    await userEvent.click(screen.getByTestId('confirm-ok'))
    expect((await screen.findByTestId('toast-error')).textContent).toContain('đang được dùng')
    expect(navigateSpy).not.toHaveBeenCalled()
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
      expect(screen.getByTestId('plan-edit-row-save')).not.toBeNull()
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

  it('phím N mở modal thêm (màn nhỏ) hoặc dòng nhập (≥ md) khi không đang gõ', async () => {
    narrow()
    renderPage()
    await screen.findByTestId('plan-table')
    await userEvent.keyboard('n')
    expect(screen.getByTestId('plan-modal').hasAttribute('open')).toBe(true)
    cleanup(); window.matchMedia = realMatchMedia
    renderPage()
    await screen.findByTestId('plan-table')
    await userEvent.keyboard('n')
    expect(screen.getByTestId('plan-inline-row')).not.toBeNull()
  })

  describe('Dòng nhập trên bảng (D-023)', () => {
    it('Thêm phiếu chèn dòng nhập đầu bảng, không mở modal; có số TK đang giữ + đếm ngược, focus ô Ngày xuất', async () => {
      renderPage()
      await userEvent.click(await screen.findByTestId('add-plan'))
      expect(screen.queryByTestId('plan-modal')).toBeNull()
      const body = screen.getByTestId('plan-table').querySelector('tbody')!
      expect(body.firstElementChild).toBe(screen.getByTestId('plan-inline-row'))
      await waitFor(() => expect((screen.getByTestId('inline-tk-number') as HTMLInputElement).value).toBe('TK0002'))
      expect(screen.getByTestId('inline-tk-hold-timer').textContent).toBe('05:00')
      expect(document.activeElement).toBe(screen.getByTestId('inline-export-date'))
    })

    it('Tab chuyển ô theo thứ tự cột', async () => {
      renderPage()
      await userEvent.click(await screen.findByTestId('add-plan'))
      await userEvent.click(screen.getByTestId('inline-order-no'))
      await userEvent.tab()
      expect(document.activeElement).toBe(screen.getByTestId('inline-transport-type'))
    })

    it('Enter lưu bằng create_transport_plan như modal; lưu xong dòng nhập đóng lại, không tự mở dòng mới (không giữ thêm số TK)', async () => {
      renderPage()
      await userEvent.click(await screen.findByTestId('add-plan'))
      await waitFor(() => expect((screen.getByTestId('inline-tk-number') as HTMLInputElement).value).toBe('TK0002'))
      await userEvent.type(screen.getByTestId('inline-order-no'), 'L9{Enter}')
      expect((await screen.findByTestId('toast-success')).textContent).toContain('Đã lưu phiếu TK0002')
      expect(rpcOf('create_transport_plan')[0][1]).toMatchObject({ p_transport_order_no: 'L9', p_material_exporter_ids: [], p_note: null })
      await waitFor(() => expect(screen.queryByTestId('plan-inline-row')).toBeNull())
      expect(rpcOf('reserve_tk_number')).toHaveLength(1) // không giữ số TK mới cho dòng kế
      expect(rpcOf('release_tk_reservation')).toHaveLength(0) // máy chủ đã xóa chỗ giữ khi lưu
    })

    it('nút "Lưu phiếu" trên header gọi create_transport_plan như Enter, lưu xong đóng dòng; "Hủy" đóng dòng và release; ẩn khi không có dòng nhập', async () => {
      renderPage()
      await screen.findByTestId('add-plan')
      expect(screen.queryByTestId('header-save')).toBeNull()
      await userEvent.click(screen.getByTestId('add-plan'))
      expect(screen.getByTestId('header-save').textContent).toBe('Lưu phiếu')
      await userEvent.type(screen.getByTestId('inline-order-no'), 'L9')
      await userEvent.click(screen.getByTestId('header-save'))
      expect((await screen.findByTestId('toast-success')).textContent).toContain('Đã lưu phiếu TK0002')
      expect(rpcOf('create_transport_plan')[0][1]).toMatchObject({ p_transport_order_no: 'L9' })
      await waitFor(() => expect(screen.queryByTestId('plan-inline-row')).toBeNull()) // lưu xong dòng đóng, không tự mở dòng mới
      expect(screen.queryByTestId('header-save')).toBeNull()
      expect(rpcOf('reserve_tk_number')).toHaveLength(1)
      // mở lại rồi "Hủy": release số đang giữ
      await userEvent.click(screen.getByTestId('add-plan'))
      await waitFor(() => expect(rpcOf('reserve_tk_number')).toHaveLength(2))
      await userEvent.click(screen.getByTestId('header-cancel')) // dòng mới chưa gõ → không confirm
      expect(screen.queryByTestId('plan-inline-row')).toBeNull()
      expect(rpcOf('release_tk_reservation')).toHaveLength(1)
    })

    it('nút "Lưu phiếu" trong dòng; lỗi từ server hiện ngay dưới dòng và giữ nguyên dữ liệu đã nhập', async () => {
      rpcFail = true
      renderPage()
      await userEvent.click(await screen.findByTestId('add-plan'))
      await userEvent.type(screen.getByTestId('inline-order-no'), 'L9')
      await userEvent.click(screen.getByTestId('plan-inline-row-save'))
      expect((await screen.findByTestId('plan-inline-row-error')).textContent).toContain('boom')
      expect((screen.getByTestId('inline-order-no') as HTMLInputElement).value).toBe('L9')
      expect(screen.queryByTestId('toast-success')).toBeNull()
    })

    it('báo Presence: mở dòng nhập → adding_plan kèm số TK đang giữ + hạn; hủy → null (D-024)', async () => {
      render(<MemoryRouter><ToastProvider><PresenceProvider><PlansPage /></PresenceProvider></ToastProvider></MemoryRouter>)
      await userEvent.click(await screen.findByTestId('add-plan'))
      await waitFor(() => expect(tracks[tracks.length - 1]).toMatchObject({ username: 'a.admin', activity: { kind: 'adding_plan', tk: 'TK0002' } }))
      expect(tracks[tracks.length - 1]?.activity?.expiresAt).toBeGreaterThan(Date.now())
      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(tracks[tracks.length - 1]?.activity).toBeNull())
    })

    it('Esc hủy dòng và nhả số đang giữ (release_tk_reservation)', async () => {
      renderPage()
      await userEvent.click(await screen.findByTestId('add-plan'))
      await waitFor(() => expect((screen.getByTestId('inline-tk-number') as HTMLInputElement).value).toBe('TK0002'))
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByTestId('plan-inline-row')).toBeNull()
      expect(rpcOf('release_tk_reservation')).toHaveLength(1)
    })

    it('hết 5 phút giữ số (không thao tác) → dòng nhập tự đóng, nhả số, toast lỗi, Presence về null', async () => {
      render(<MemoryRouter><ToastProvider><PresenceProvider><PlansPage /></PresenceProvider></ToastProvider></MemoryRouter>)
      await userEvent.click(await screen.findByTestId('add-plan'))
      await waitFor(() => expect((screen.getByTestId('inline-tk-number') as HTMLInputElement).value).toBe('TK0002'))
      const real = Date.now()
      const spy = vi.spyOn(Date, 'now').mockImplementation(() => real + 301_000) // tua đồng hồ; interval 1 giây thật sẽ thấy hết hạn
      try {
        await waitFor(() => expect(screen.queryByTestId('plan-inline-row')).toBeNull(), { timeout: 3000 })
        expect((await screen.findByTestId('toast-error')).textContent).toContain('Hết thời gian giữ số TK0002 — dòng nhập đã bị hủy')
        expect(rpcOf('release_tk_reservation')).toHaveLength(1)
        await waitFor(() => expect(tracks[tracks.length - 1]?.activity).toBeNull())
      } finally { spy.mockRestore() }
    })

    it('đổi trang khi đang có dòng nhập: dòng nhập vẫn ở đầu bảng', async () => {
      total = 120
      renderPage()
      await userEvent.click(await screen.findByTestId('add-plan'))
      await userEvent.click(screen.getByTestId('page-next'))
      await waitFor(() => expect((screen.getByTestId('page-input') as HTMLInputElement).value).toBe('2'))
      expect(screen.getByTestId('plan-inline-row')).not.toBeNull()
    })
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
