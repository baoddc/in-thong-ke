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
// calls: lệnh gọi lên inspection_details_view (dữ liệu); countCalls: lên inspection_details (đếm riêng)
// rpcCalls: tham số mỗi lần gọi RPC list_inspection_details (dữ liệu trang, D-017)
const h = vi.hoisted(() => ({ rpcCalls: [] as Record<string, unknown>[], countCalls: [] as unknown[][], count: 41800 as number | null, countError: null as { message: string } | null, rows: [] as unknown[], editRows: [] as unknown[], editRpc: [] as [string, unknown][] }))
vi.mock('../lib/supabase', () => {
  const chain = (data: unknown, t: string) => {
    const c: Record<string, unknown> = { then: (r: (v: unknown) => unknown) => r(t === 'inspection_details' ? { data: null, error: h.countError, count: h.countError ? null : h.count } : { data, error: null }) }
    for (const m of ['select', 'order', 'limit', 'range', 'eq', 'in', 'or', 'gte', 'lte']) c[m] = (...a: unknown[]) => { if (t === 'inspection_details') h.countCalls.push([m, ...a]); return c }
    c.maybeSingle = () => Promise.resolve({ data: null, error: null }) // tra phiếu của dòng khi mở modal
    return c
  }
  return {
    supabase: {
      from: (t: string) => chain(t === 'lookup_items' ? lookups : t === 'edit_requests' ? h.editRows : [], t),
      rpc: (fn: string, args: Record<string, unknown>) => {
        if (fn === 'request_detail_edit') { h.editRpc.push([fn, args]); return Promise.resolve({ data: 5, error: null }) }
        if (fn === 'list_inspection_details') { h.rpcCalls.push(args); return Promise.resolve({ data: h.rows.length ? h.rows : [oldRow], error: null }) }
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

const renderPage = (url = '/') => render(<MemoryRouter initialEntries={[url]}><ToastProvider><InspectionPage /></ToastProvider></MemoryRouter>)

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
})
beforeEach(() => { localStorage.clear(); clearListCache(); h.rpcCalls.length = 0; h.countCalls.length = 0; h.count = 41800; h.countError = null; h.rows = []; h.editRows = []; h.editRpc.length = 0 })
afterEach(cleanup)

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

  it('đếm chính xác trên bảng gốc, dữ liệu trang qua RPC; lỗi đếm vẫn hiện dữ liệu, chỉ "Trang x"', async () => {
    h.countError = { message: 'boom' }
    renderPage()
    await screen.findByTestId('row-9')
    expect(h.rpcCalls[0]).toMatchObject({ p_sort: 'created_at', p_desc: true, p_limit: 50, p_offset: 0 })
    expect(screen.queryByTestId('page-total')).toBeNull()
    expect(screen.queryByTestId('page-count')).toBeNull()
    expect((screen.getByTestId('page-input') as HTMLInputElement).value).toBe('1')
    expect((screen.getByTestId('page-next') as HTMLButtonElement).disabled).toBe(true) // trang chưa đầy (1/50 dòng)
  })

  it('trang hiện tại đầy → nút Sau bật dù số đếm nói đã hết trang', async () => {
    h.count = 50 // chỉ 1 trang theo số đếm
    h.rows = Array.from({ length: 50 }, (_, i) => ({ ...oldRow, id: i + 1 }))
    renderPage()
    await screen.findByTestId('row-1')
    expect(screen.getByTestId('page-count').textContent).toBe('/1')
    expect((screen.getByTestId('page-next') as HTMLButtonElement).disabled).toBe(false)
  })

  it('D-012: tìm nhanh chỉ trên TK + số phiếu; lọc công trình/đơn vị nhận theo id; đếm exact trên bảng gốc cùng bộ lọc; hiện tên công trình từ id', async () => {
    renderPage('/?q=49001&cons=77&recv=8')
    await screen.findByTestId('row-9')
    expect(h.rpcCalls[0]).toEqual({
      p_q: '49001', p_from: null, p_to: null, p_export_type_id: null, p_product_id: null, p_construction_id: 77, p_receiving_unit_id: 8,
      p_sort: 'created_at', p_desc: true, p_limit: 50, p_offset: 0,
    })
    // request đếm: bảng gốc, head + exact, cùng bộ lọc, không sắp xếp/phân trang
    expect(h.countCalls.slice(0, 4)).toEqual([ // (các lần sau là request prefetch trang kế)
      ['select', 'id', { count: 'exact', head: true }],
      ['or', 'tk_number.ilike.%49001%,warehouse_slip_no.ilike.%49001%'],
      ['eq', 'construction_id', 77],
      ['eq', 'receiving_unit_id', 8],
    ])
    await waitFor(() => expect((screen.getByTestId('filter-construction') as HTMLInputElement).value).toBe('Nhà máy Bình Dương'))
    await userEvent.click(screen.getByTestId('toggle-filters')) // ẩn bộ lọc → hiện số bộ lọc đang bật
    expect(screen.getByTestId('toggle-filters').textContent).toContain('3') // q + cons + recv
  })

  it('Thêm dòng mở modal, Đơn vị giao hàng mặc định "An Hạ"', async () => {
    renderPage()
    await userEvent.click(await screen.findByTestId('add-inspection'))
    expect(screen.getByTestId('inspection-modal').hasAttribute('open')).toBe(true)
    await waitFor(() => expect((screen.getByTestId('delivery-unit') as HTMLInputElement).value).toBe('An Hạ'))
    expect((screen.getByTestId('receiving-unit') as HTMLInputElement).value).toBe('')
  })

  it('chưa chọn số phiếu TK thì chặn lưu', async () => {
    renderPage()
    await userEvent.click(await screen.findByTestId('add-inspection'))
    await userEvent.click(screen.getByTestId('inspection-save'))
    expect((await screen.findByTestId('inspection-error')).textContent).toContain('số phiếu thống kê')
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
