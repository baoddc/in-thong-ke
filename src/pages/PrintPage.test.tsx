// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

const plan = {
  id: 7, tk_number: 'TK2026/10-471', created_at: '2026-10-28T14:16:09+00:00', transport_order_no: '008784',
  vehicle: { name: '51D-44521' }, driver: { name: 'Phạm Minh Luân' }, fg_exporter: { name: 'Lê Văn Chiêu' }, material_exporters: [],
}
const rows = [
  { id: 1, plan_id: 7, export_date: '2026-10-28', warehouse_slip_no: '4900173522', quantity: 30, total_weight_kg: 12500.94, carrier_name: 'Xe DDC', receiving_unit_name: 'Kho Bình Chánh', unit_name: 'PCS' },
  { id: 2, plan_id: 7, export_date: '2026-10-28', warehouse_slip_no: '4900173521', quantity: 27, total_weight_kg: 10019.16, carrier_name: 'Xe DDC' },
  { id: 3, plan_id: 7, export_date: '2026-10-28', warehouse_slip_no: '4900173562', quantity: 36, total_weight_kg: null, carrier_name: null },
]

vi.mock('../lib/supabase', () => {
  const chain = (data: unknown, one?: unknown) => {
    const c: Record<string, unknown> = { then: (r: (v: unknown) => unknown) => r({ data, error: null }), maybeSingle: () => Promise.resolve({ data: one, error: null }) }
    for (const m of ['select', 'order', 'range', 'eq']) c[m] = () => c
    return c
  }
  return { supabase: { from: (t: string) => (t === 'transport_plans' ? chain([{ id: 7, tk_number: 'TK2026/10-471' }], plan) : chain(rows)) } }
})

import PrintPage from './PrintPage'

afterEach(cleanup)

describe('PrintPage', () => {
  it('chưa chọn phiếu: nút In bị vô hiệu', async () => {
    render(<MemoryRouter><PrintPage /></MemoryRouter>)
    expect((screen.getByTestId('print-button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('?tk=... hiện bản in với tổng khớp mẫu', async () => {
    render(<MemoryRouter initialEntries={['/in-thong-ke?tk=TK2026%2F10-471']}><PrintPage /></MemoryRouter>)
    expect(await screen.findByText('THỐNG KÊ BÀN GIAO PHIẾU XUẤT KHO')).toBeTruthy()
    expect(screen.getByTestId('print-tk').textContent).toBe('TK2026/10-471')
    expect(screen.getByTestId('print-total-qty').textContent).toBe('93,00')
    expect(screen.getByTestId('print-total-weight').textContent).toBe('22.520,10')
    expect(screen.getByTestId('print-created').textContent).toBe('28/10/2026 21:16:09')
    expect(screen.getByTestId('print-driver').textContent).toBe('PHẠM MINH LUÂN')
    expect(screen.getByTestId('print-shipper').textContent).toBe('LÊ VĂN CHIÊU')
    expect(screen.getByTestId('print-slips').textContent).toBe('3')
    expect(screen.getByTestId('print-carrier').textContent).toBe('Xe DDC')
    expect((screen.getByTestId('print-button') as HTMLButtonElement).disabled).toBe(false)
  })
})
