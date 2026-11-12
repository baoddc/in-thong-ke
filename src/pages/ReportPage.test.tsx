// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }))
vi.mock('../lib/dbChanges', () => ({ useDbChange: () => {} }))
vi.mock('../lib/format', async (orig) => ({ ...(await orig<typeof import('../lib/format')>()), todayISO: () => '2026-11-10' }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (_fn: string, a: Record<string, unknown>) => {
      h.calls.push(a)
      const rows = a.p_group === 'month' && a.p_from === '2025-01-01'
        ? [{ key_id: 202510, key_name: '2025-10', row_count: 8, quantity_sum: 1, weight_kg_sum: 4000000 }, { key_id: 202512, key_name: '2025-12', row_count: 8, quantity_sum: 1, weight_kg_sum: 9000000 }]
        : a.p_group === 'month'
        ? [{ key_id: 202610, key_name: '2026-10', row_count: 10, quantity_sum: 1, weight_kg_sum: 8000000 }, { key_id: 202611, key_name: '2026-11', row_count: 5, quantity_sum: 1, weight_kg_sum: 2000000 }]
        : [{ key_id: 1, key_name: '1- Điều chuyển nội bộ', row_count: 12, quantity_sum: 1, weight_kg_sum: 6000000 }, { key_id: null, key_name: null, row_count: 3, quantity_sum: 1, weight_kg_sum: 4000000 }]
      return Promise.resolve({ data: rows, error: null })
    },
    from: () => ({ select: () => ({ gte: () => ({ lt: () => Promise.resolve({ count: 7, error: null }) }) }) }),
  },
}))

import ReportPage from './ReportPage'

afterEach(() => { cleanup(); h.calls.length = 0 })

describe('ReportPage', () => {
  it('hiện tổng, tháng nhiều nhất và tỷ trọng theo loại hình (đơn vị tấn)', async () => {
    render(<ReportPage />)
    await waitFor(() => expect(screen.getByTestId('kpi-weight').textContent).toContain('10.000'))
    expect(screen.getByTestId('kpi-weight').textContent).toContain('-23,1%') // cùng kỳ cả năm 2025 = 13.000 tấn
    expect(screen.getByTestId('report-share-bar').children).toHaveLength(2) // thanh cơ cấu: 2 loại hình
    expect(screen.getByTestId('kpi-weight').textContent).toContain('▼') // giảm so với cùng kỳ: có ký hiệu, không chỉ màu
    await userEvent.click(screen.getByTestId('report-view-toggle')) // xem dạng bảng
    expect(screen.getByTestId('report-months-table').querySelectorAll('tbody tr')).toHaveLength(12)
    await userEvent.click(screen.getByTestId('report-view-toggle'))
    expect(screen.getAllByTestId('product-row').length).toBe(2)
    expect(screen.getByTestId('kpi-plans').textContent).toContain('7')
    expect(screen.getByTestId('kpi-lines').textContent).toContain('15')
    expect(screen.getByTestId('kpi-peak').textContent).toContain('Tháng 10')
    const rows = screen.getAllByTestId('type-row').map((r) => r.textContent ?? '')
    expect(rows[0]).toContain('1- Điều chuyển nội bộ')
    expect(rows[0]).toContain('60%')
    expect(rows[1]).toContain('Chưa chọn loại hình')
    expect(screen.getAllByTestId(/^month-/)).toHaveLength(12)
  })

  it('đổi năm thì tải lại theo khoảng năm đó', async () => {
    render(<ReportPage />)
    await waitFor(() => expect(h.calls.length).toBeGreaterThan(0))
    expect(h.calls[0]).toMatchObject({ p_from: '2026-01-01', p_to: '2027-01-01' })
    await userEvent.selectOptions(screen.getByTestId('report-year'), '2025')
    await waitFor(() => expect(h.calls.some((c) => c.p_from === '2025-01-01' && c.p_to === '2026-01-01')).toBe(true))
  })

  it('lọc theo tháng và theo ngày: gọi đúng khoảng, cùng kỳ năm trước dịch đúng, khoảng sai báo lỗi', async () => {
    render(<ReportPage />)
    await waitFor(() => expect(h.calls.length).toBeGreaterThan(0))
    await userEvent.selectOptions(screen.getByTestId('report-month'), '2') // tháng 2/2026
    await waitFor(() => expect(h.calls.some((c) => c.p_from === '2026-02-01' && c.p_to === '2026-03-01')).toBe(true))
    expect(h.calls.some((c) => c.p_from === '2025-02-01' && c.p_to === '2025-03-01')).toBe(true) // cùng kỳ
    expect((screen.getByTestId('report-to') as HTMLInputElement).value).toBe('2026-02-28')
    fireEvent.change(screen.getByTestId('report-from'), { target: { value: '2026-02-10' } }) // tuỳ chọn ngày
    await waitFor(() => expect(h.calls.some((c) => c.p_from === '2026-02-10' && c.p_to === '2026-03-01')).toBe(true))
    fireEvent.change(screen.getByTestId('report-to'), { target: { value: '2026-02-05' } }) // từ > đến
    expect((await screen.findByTestId('report-error')).textContent).toContain('Khoảng ngày không hợp lệ')
  })
})
