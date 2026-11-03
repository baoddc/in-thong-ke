// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const lookups = [
  { id: 5, kind: 'delivery_unit', name: 'An Hạ', code: null },
  { id: 6, kind: 'delivery_unit', name: 'Khác', code: null },
]

// Dòng cũ: không có phiếu TK (plan_id null) nên các cột theo phiếu trống.
const oldRow = { id: 9, plan_id: null, tk_number: null, transport_order_no: null, export_date: '2026-09-30', product_name: 'Thép tấm', quantity: 1234.5, total_weight_kg: 5422 }

// Mọi chuỗi gọi trả về chính nó và có thể await; lookup_items và inspection_details_view có dữ liệu.
// countCalls: tham số mỗi lần gọi RPC count_inspection_details (D-021)
// rpcCalls: tham số mỗi lần gọi RPC list_inspection_details (dữ liệu trang, D-017)
const h = vi.hoisted(() => ({ rpcCalls: [] as Record<string, unknown>[], countCalls: [] as Record<string, unknown>[], count: 41800 as number | null, countError: null as { message: string } | null, rows: [] as unknown[], editRows: [] as unknown[], editRpc: [] as [string, unknown][], inserted: [] as Record<string, unknown>[] }))
// Phiếu TK mà ô Số phiếu TK của dòng nhập tìm thấy / tra cứu (D-023)
const tkPlan = { id: 3, tk_number: 'TK0003', export_date: '2026-10-02', transport_order_no: 'L3', vehicle: { name: '51D-1' }, driver: { name: 'Tài xế A' }, fg_exporter: null, material_exporters: [] }
vi.mock('../lib/supabase', () => {
  const chain = (data: unknown) => {
    const c: Record<string, unknown> = { then: (r: (v: unknown) => unknown) => r({ data, error: null }) }
    for (const m of ['select', 'order', 'limit', 'range', 'eq', 'in', 'or', 'gte', 'lte']) c[m] = () => c
    c.maybeSingle = () => Promise.resolve({ data: tkPlan, error: null }) // tra phiếu của dòng
    c.insert = (p: Record<string, unknown>) => { h.inserted.push(p); return Promise.resolve({ error: null }) }
    return c
  }
  return {
    supabase: {
      from: (t: string) => chain(t === 'lookup_items' ? lookups : t === 'edit_requests' ? h.editRows : []),
      rpc: (fn: string, args: Record<string, unknown>) => {
        if (fn === 'request_detail_edit') { h.editRpc.push([fn, args]); return Promise.resolve({ data: 5, error: null }) }
        if (fn === 'count_inspection_details') { h.countCalls.push(args); return Promise.resolve(h.countError ? { data: null, error: h.countError } : { data: h.count, error: null }) }
        if (fn === 'list_inspection_details') { h.rpcCalls.push(args); return Promise.resolve({ data: h.rows.length ? h.rows : [oldRow], error: null }) }
        if (fn === 'search_plan_numbers') return Promise.resolve({ data: [{ id: 3, tk_number: 'TK0003', export_date: '2026-10-02' }], error: null })
        return Promise.resolve({ data: fn === 'get_lookup_items' ? [{ id: 77, kind: 'construction', name: 'Nhà máy Bình Dương', code: 'CT77' }] : [], error: null })
      },
    },
  }
})

const me = vi.hoisted(() => ({ id: 'u1', role: 'user', is_active: true }))
vi.mock('../lib/useProfile', () => ({ useProfile: () => ({ profile: me, isAdmin: false, loading: false, error: '' }) }))

import InspectionPage from './InspectionPage'
import { ToastProvider } from '../components/ui/Toast'
import { clearListCache } from '../lib/listCache'

const renderPage = (url = '/?from=&to=') => render(<MemoryRouter initialEntries={[url]}><ToastProvider><InspectionPage /></ToastProvider></MemoryRouter>)

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
})
const realMatchMedia = window.matchMedia
const narrow = () => { window.matchMedia = ((q: string) => ({ matches: true, media: q })) as unknown as typeof window.matchMedia } // < md: Thêm mở modal
beforeEach(() => { h.inserted.length = 0; localStorage.clear(); clearListCache(); h.rpcCalls.length = 0; h.countCalls.length = 0; h.count = 41800; h.countError = null; h.rows = []; h.editRows = []; h.editRpc.length = 0 })
afterEach(() => { cleanup(); window.matchMedia = realMatchMedia })

describe('InspectionPage', () => {
  it('dòng không có số TK vẫn hiện: Số TK là "—", số kiểu VN căn phải', async () => {
    renderPage()
    const row = await screen.findByTestId('row-9')
    expect(row.textContent).toContain('—')
    expect(row.textContent).toContain('30/09/2026')
    expect(row.textContent).toContain('1.234,5')
    expect(row.textContent).toContain('5.422')
    expect(screen.getByTestId('page-count').textContent).toBe('/836') // 41.800 / 50
    expect(screen.getByTestId('page-total').textContent).toBe('· tổng 41.800 dòng')
  })

  it('đếm và dữ liệu trang đều qua RPC; lỗi đếm vẫn hiện dòng, chỉ "Trang x"', async () => {
    h.countError = { message: 'boom' }
    renderPage()
    await screen.findByTestId('row-9')
    expect(h.rpcCalls[0]).toMatchObject({ p_sort: 'created_at', p_desc: true, p_limit: 50, p_offset: 0 })
    expect(h.countCalls[0]).toEqual({ p_q: null, p_from: null, p_to: null })
    expect(screen.queryByTestId('page-total')).toBeNull()
    expect(screen.queryByTestId('page-count')).toBeNull()
    expect((screen.getByTestId('page-input') as HTMLInputElement).value).toBe('1')
    expect((screen.getByTestId('page-next') as HTMLButtonElement).disabled).toBe(true) // trang chưa đầy (1/50 dòng)
  })

  it('T-073: không có ngày trên URL → mặc định hôm nay (giờ VN); Xóa bộ lọc → xem tất cả, không bị đặt lại; URL có ngày khác → giữ', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-31T18:00:00Z')) // 01/11/2026 01:00 giờ VN
    try {
      renderPage('/')
      await screen.findByTestId('row-9')
      expect(h.rpcCalls[0]).toMatchObject({ p_from: '2026-11-01', p_to: '2026-11-01' })
      expect(h.countCalls[0]).toMatchObject({ p_from: '2026-11-01', p_to: '2026-11-01' })
      expect((screen.getByTestId('filter-from') as HTMLInputElement).value).toBe('01/11/2026')
      await userEvent.click(screen.getByTestId('clear-filters'))
      await waitFor(() => expect(h.rpcCalls[h.rpcCalls.length - 1]).toMatchObject({ p_from: null, p_to: null }))
      expect(screen.queryByTestId('clear-filters')).toBeNull()
      cleanup(); h.rpcCalls.length = 0; clearListCache()
      renderPage('/?from=2026-10-05&to=2026-10-06')
      await screen.findByTestId('row-9')
      expect(h.rpcCalls[0]).toMatchObject({ p_from: '2026-10-05', p_to: '2026-10-06' })
    } finally { vi.useRealTimers() }
  })

  it('trang hiện tại đầy → nút Sau bật dù số đếm nói đã hết trang', async () => {
    h.count = 50 // chỉ 1 trang theo số đếm
    h.rows = Array.from({ length: 50 }, (_, i) => ({ ...oldRow, id: i + 1 }))
    renderPage()
    await screen.findByTestId('row-1')
    expect(screen.getByTestId('page-count').textContent).toBe('/1')
    expect((screen.getByTestId('page-next') as HTMLButtonElement).disabled).toBe(false)
  })

  it('T-075: chỉ còn tìm nhanh + khoảng ngày; không còn lọc loại hình xuất/mặt hàng/công trình/đơn vị nhận; tham số cũ trên URL bị bỏ qua', async () => {
    renderPage('/?q=49001&type=3&product=5&cons=77&recv=8&from=&to=')
    await screen.findByTestId('row-9')
    expect(h.rpcCalls[0]).toEqual({ p_q: '49001', p_from: null, p_to: null, p_sort: 'created_at', p_desc: true, p_limit: 50, p_offset: 0 })
    expect(h.countCalls[0]).toEqual({ p_q: '49001', p_from: null, p_to: null })
    for (const id of ['filter-type', 'filter-product', 'filter-construction', 'filter-receiving']) expect(screen.queryByTestId(id)).toBeNull()
    await userEvent.click(screen.getByTestId('toggle-filters')) // ẩn bộ lọc → hiện số bộ lọc đang bật
    expect(screen.getByTestId('toggle-filters').textContent).toContain('1') // chỉ q
    expect(screen.getByTestId('toggle-filters').textContent).not.toContain('2')
  })

  it('Thêm dòng trên màn nhỏ mở modal, Đơn vị giao hàng mặc định "An Hạ"', async () => {
    narrow()
    renderPage()
    await userEvent.click(await screen.findByTestId('add-inspection'))
    expect(screen.getByTestId('inspection-modal').hasAttribute('open')).toBe(true)
    await waitFor(() => expect((screen.getByTestId('delivery-unit') as HTMLInputElement).value).toBe('An Hạ'))
    expect((screen.getByTestId('receiving-unit') as HTMLInputElement).value).toBe('')
  })

  it('chưa chọn số phiếu TK thì chặn lưu', async () => {
    narrow()
    renderPage()
    await userEvent.click(await screen.findByTestId('add-inspection'))
    await userEvent.click(screen.getByTestId('inspection-save'))
    expect((await screen.findByTestId('inspection-error')).textContent).toContain('số phiếu thống kê')
  })

  describe('Dòng nhập trên bảng (D-023)', () => {
    const open = async () => {
      renderPage()
      await userEvent.click(await screen.findByTestId('add-inspection'))
    }
    const field = (id: string) => screen.getByTestId(id) as HTMLInputElement
    const pickTk = async () => {
      await userEvent.type(field('inline-tk'), 'TK')
      await userEvent.click(await screen.findByRole('option', { name: /TK0003/ }))
    }

    it('Thêm dòng chèn dòng nhập đầu bảng (không modal), focus ô Số phiếu TK; ô khác khóa kèm gợi ý "Chọn Số phiếu TK trước"', async () => {
      await open()
      expect(screen.queryByTestId('inspection-modal')).toBeNull()
      expect(screen.getByTestId('inspection-table').querySelector('tbody')!.firstElementChild).toBe(screen.getByTestId('inspection-inline-row'))
      expect(document.activeElement).toBe(field('inline-tk'))
      for (const id of ['inline-export-date', 'inline-product', 'inline-quantity', 'inline-weight', 'inline-slip-no', 'inline-note']) expect(field(id).disabled).toBe(true)
      expect(field('inline-quantity').placeholder).toBe('Chọn Số phiếu TK trước')
      expect(field('inline-quantity').closest('td')!.title).toBe('Chọn Số phiếu TK trước')
    })

    it('chọn số TK → mở khóa các ô, tự điền số lệnh VC, xe, tài xế, ngày xuất', async () => {
      await open()
      await pickTk()
      await waitFor(() => expect(field('inline-ro-order-no').value).toBe('L3'))
      expect(field('inline-ro-vehicle').value).toBe('51D-1')
      expect(field('inline-ro-driver').value).toBe('Tài xế A')
      expect(field('inline-product').disabled).toBe(false)
      expect(field('inline-quantity').disabled).toBe(false)
      expect(field('inline-export-date').value).toBe('02/10/2026')
    })

    it('Enter lưu bằng insert như modal; sau lưu dòng nhập xóa mặt hàng/số lượng nhưng giữ số TK', async () => {
      await open()
      await pickTk()
      await waitFor(() => expect(field('inline-quantity').disabled).toBe(false))
      await userEvent.type(field('inline-quantity'), '2{Enter}')
      expect((await screen.findByTestId('toast-success')).textContent).toContain('Đã lưu dòng')
      expect(h.inserted[0]).toMatchObject({ plan_id: 3, export_date: '2026-10-02', quantity: 2, delivery_unit_id: 5 })
      expect(field('inline-quantity').value).toBe('')
      expect(field('inline-tk').value).toBe('TK0003')
      expect(field('inline-quantity').disabled).toBe(false)
      expect(screen.getByTestId('inspection-inline-row')).not.toBeNull()
    })

    it('chưa chọn số TK mà Enter → báo lỗi dưới dòng, không insert', async () => {
      await open()
      await userEvent.keyboard('{Enter}')
      expect((await screen.findByTestId('inspection-inline-row-error')).textContent).toContain('Vui lòng chọn số phiếu thống kê.')
      expect(h.inserted).toHaveLength(0)
    })

    it('Esc hủy dòng nhập', async () => {
      await open()
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByTestId('inspection-inline-row')).toBeNull()
    })

    it('nút "Lưu dòng" trên header insert như Enter; "Hủy" đóng dòng; ẩn khi không có dòng nhập', async () => {
      renderPage()
      await screen.findByTestId('add-inspection')
      expect(screen.queryByTestId('header-save')).toBeNull()
      await userEvent.click(screen.getByTestId('add-inspection'))
      expect(screen.getByTestId('header-save').textContent).toBe('Lưu dòng')
      await pickTk()
      await waitFor(() => expect(field('inline-quantity').disabled).toBe(false))
      await userEvent.type(field('inline-quantity'), '2')
      await userEvent.click(screen.getByTestId('header-save'))
      expect((await screen.findByTestId('toast-success')).textContent).toContain('Đã lưu dòng')
      expect(h.inserted[0]).toMatchObject({ plan_id: 3, quantity: 2 })
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      await userEvent.click(screen.getByTestId('header-cancel'))
      expect(screen.queryByTestId('inspection-inline-row')).toBeNull()
      expect(screen.queryByTestId('header-save')).toBeNull()
    })
  })

  it('mobile (375px) chưa có trạng thái lưu → bộ lọc mặc định thu gọn; bấm hiện thì mở', async () => {
    const mm = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: true, media: q })) as unknown as typeof window.matchMedia
    try {
      renderPage()
      await screen.findByTestId('row-9')
      expect(screen.getByTestId('filters-panel').dataset.state).toBe('closed')
      expect(screen.getByTestId('toggle-filters').getAttribute('aria-expanded')).toBe('false')
      await userEvent.click(screen.getByTestId('toggle-filters'))
      expect(screen.getByTestId('filters-panel').dataset.state).toBe('open')
      expect(localStorage.getItem('tk:ui:inspection:filters')).toBe('1')
    } finally { window.matchMedia = mm }
  })

  it('máy tính: bộ lọc mặc định hiện; ẩn thì trạng thái được lưu', async () => {
    renderPage()
    await screen.findByTestId('row-9')
    expect(screen.getByTestId('filters-panel').dataset.state).toBe('open')
    await userEvent.click(screen.getByTestId('toggle-filters'))
    expect(localStorage.getItem('tk:ui:inspection:filters')).toBe('0')
  })

  describe('Yêu cầu sửa dòng quá 24 giờ (D-020)', () => {
    const own = () => { h.rows = [{ ...oldRow, plan_id: 3, tk_number: 'TK0003', warehouse_slip_no: 'PXK1', created_by: 'u1', created_at: '2026-10-01T00:00:00Z' }] }
    const future = () => new Date(Date.now() + 3_600_000).toISOString()

    it('dòng của mình quá 24 giờ: nút "Yêu cầu sửa" → nhập lý do → gọi request_detail_edit; Xóa tắt', async () => {
      own()
      renderPage()
      expect((await screen.findByTestId('delete-9') as HTMLButtonElement).disabled).toBe(true)
      await userEvent.click(screen.getByTestId('request-edit-9'))
      await userEvent.click(screen.getByTestId('edit-request-modal-submit'))
      expect(screen.getByRole('alert').textContent).toContain('Vui lòng nhập lý do')
      await userEvent.type(screen.getByTestId('edit-request-modal-text'), 'Sai số lượng')
      await userEvent.click(screen.getByTestId('edit-request-modal-submit'))
      expect((await screen.findByTestId('toast-success')).textContent).toContain('Đã gửi yêu cầu sửa dòng bảng kiểm TK0003 / PXK PXK1')
      expect(h.editRpc).toEqual([['request_detail_edit', { p_detail_id: 9, p_reason: 'Sai số lượng' }]])
    })

    it('đang chờ duyệt: badge "Chờ duyệt", không cho gửi lại', async () => {
      own()
      h.editRows = [{ plan_id: null, detail_id: 9, status: 'pending', unlock_until: null }]
      renderPage()
      expect((await screen.findByTestId('edit-pending-9')).textContent).toBe('Chờ duyệt')
      expect(screen.queryByTestId('request-edit-9')).toBeNull()
    })

    it.each([
      ['theo dòng', { plan_id: null, detail_id: 9 }],
      ['theo phiếu của dòng', { plan_id: 3, detail_id: null }],
    ])('đã duyệt %s: hiện "Sửa đến", Sửa mở form có nút Lưu, Xóa vẫn tắt', async (_name, ids) => {
      own()
      h.editRows = [{ ...ids, status: 'approved', unlock_until: future() }]
      renderPage()
      expect((await screen.findByTestId('edit-unlocked-9')).textContent).toContain('Sửa đến')
      expect((screen.getByTestId('delete-9') as HTMLButtonElement).disabled).toBe(true)
      expect(screen.queryByTestId('request-edit-9')).toBeNull()
      await userEvent.click(screen.getByTestId('edit-9'))
      expect(screen.getByTestId('inspection-save')).not.toBeNull()
    })

    it('dòng của người khác: không có nút "Yêu cầu sửa"', async () => {
      own()
      Object.assign(h.rows[0] as object, { created_by: 'x' })
      renderPage()
      await screen.findByTestId('row-9')
      expect(screen.queryByTestId('request-edit-9')).toBeNull()
    })
  })})
