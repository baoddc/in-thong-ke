// @vitest-environment jsdom
// T-025 (tester): bản in - tổng, "Tổng số phiếu", ô trống, chuỗi rất dài/ký tự đặc biệt.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import PrintSheet from './PrintSheet'
import type { PlanRow } from '../types/plan'
import type { InspectionRow } from '../types/inspection'

afterEach(cleanup)

const plan = {
  id: 1, tk_number: 'TK2026/10-001', created_at: '2026-10-29T09:00:00+00:00', export_date: '2026-10-29', transport_order_no: null,
  transport_type: null, vehicle: null, driver: null, fg_exporter: null, material_exporters: [],
} as unknown as PlanRow
const row = (o: Partial<InspectionRow>) => ({ id: 1, ...o }) as InspectionRow

describe('PrintSheet', () => {
  it('phiếu chưa có dòng: tổng 0,00, tổng số phiếu 0, không vỡ', () => {
    render(<PrintSheet plan={plan} rows={[]} />)
    expect(screen.getByTestId('print-total-qty').textContent).toBe('0,00')
    expect(screen.getByTestId('print-total-weight').textContent).toBe('0,00')
    expect(screen.getByTestId('print-slips').textContent).toBe('0')
    expect(screen.getByTestId('print-shipper').textContent).toBe('')
  })

  it('tổng khối lượng lớn đúng định dạng VN; số phiếu trùng chỉ đếm 1; ô trống không in "null"', () => {
    const rows = [
      row({ id: 1, quantity: 1, total_weight_kg: 246043357.56, warehouse_slip_no: '49001' }),
      row({ id: 2, quantity: 2.5, total_weight_kg: 0.44, warehouse_slip_no: '49001' }),
      row({ id: 3, quantity: 0, total_weight_kg: 0, warehouse_slip_no: '49002', note: null, construction_name: null }),
    ]
    render(<PrintSheet plan={plan} rows={rows} />)
    expect(screen.getByTestId('print-total-weight').textContent).toBe('246.043.358,00')
    expect(screen.getByTestId('print-total-qty').textContent).toBe('3,50')
    expect(screen.getByTestId('print-slips').textContent).toBe('2')
    expect(screen.getByTestId('print-table').textContent).not.toMatch(/null|undefined|NaN/)
  })

  it('chuỗi tiếng Việt rất dài + ký tự đặc biệt được render nguyên văn (không bị chèn HTML)', () => {
    const long = 'Công trình ' + 'Đường Nguyễn Văn Linh '.repeat(80)
    render(<PrintSheet plan={plan} rows={[row({ construction_name: long, note: '<b>x</b> & "y"' })]} />)
    const t = screen.getByTestId('print-table')
    expect(t.textContent).toContain(long.trim())
    expect(t.textContent).toContain('<b>x</b> & "y"')
    expect(t.querySelector('b')).toBeNull()
  })

  it('NV xuất hàng/tài xế in HOA có dấu', () => {
    render(<PrintSheet plan={{ ...plan, driver: { name: 'phạm minh luân' }, fg_exporter: { name: 'Lê Văn Chiêu' } } as PlanRow} rows={[]} />)
    expect(screen.getByTestId('print-driver').textContent).toBe('PHẠM MINH LUÂN')
    expect(screen.getByTestId('print-shipper').textContent).toBe('LÊ VĂN CHIÊU')
  })
})
