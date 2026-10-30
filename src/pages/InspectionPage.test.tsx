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
const h = vi.hoisted(() => ({ calls: [] as unknown[][] })) // các lệnh gọi lên inspection_details_view
vi.mock('../lib/supabase', () => {
  const chain = (data: unknown, t: string) => {
    const c: Record<string, unknown> = { then: (r: (v: unknown) => unknown) => r({ data, error: null }) }
    for (const m of ['select', 'order', 'limit', 'range', 'eq', 'in', 'or', 'gte', 'lte']) c[m] = (...a: unknown[]) => { if (t === 'inspection_details_view') h.calls.push([m, ...a]); return c }
    return c
  }
  return {
    supabase: {
      from: (t: string) => chain(t === 'lookup_items' ? lookups : t === 'inspection_details_view' ? [oldRow] : [], t),
      rpc: (fn: string) => Promise.resolve({ data: fn === 'get_lookup_items' ? [{ id: 77, kind: 'construction', name: 'Nhà máy Bình Dương', code: 'CT77' }] : [], error: null }),
    },
  }
})

import InspectionPage from './InspectionPage'
import { ToastProvider } from '../components/ui/Toast'

const renderPage = (url = '/') => render(<MemoryRouter initialEntries={[url]}><ToastProvider><InspectionPage /></ToastProvider></MemoryRouter>)

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
})
beforeEach(() => { localStorage.clear(); h.calls.length = 0 })
afterEach(cleanup)

describe('InspectionPage', () => {
  it('dòng không có số TK vẫn hiện: Số TK là "—", số kiểu VN căn phải', async () => {
    renderPage()
    const row = await screen.findByTestId('row-9')
    expect(row.textContent).toContain('—')
    expect(row.textContent).toContain('30/09/2026')
    expect(row.textContent).toContain('1.234,5')
    expect(row.textContent).toContain('5.422')
    expect(screen.getByTestId('page-info').textContent).toBe('Trang 1/1 · tổng 1 dòng')
  })

  it('D-012: tìm nhanh chỉ trên TK + số phiếu; lọc công trình/đơn vị nhận theo id; đếm estimated; hiện tên công trình từ id', async () => {
    renderPage('/?q=49001&cons=77&recv=8')
    await screen.findByTestId('row-9')
    const or = h.calls.find((c) => c[0] === 'or')
    expect(or).toEqual(['or', 'tk_number.ilike.%49001%,warehouse_slip_no.ilike.%49001%'])
    expect(String(or?.[1])).not.toContain('construction')
    expect(h.calls).toContainEqual(['eq', 'construction_id', 77])
    expect(h.calls).toContainEqual(['eq', 'receiving_unit_id', 8])
    expect(h.calls).toContainEqual(['select', '*', { count: 'estimated' }])
    expect(h.calls).toContainEqual(['order', 'id', { ascending: false }])
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
  })})
