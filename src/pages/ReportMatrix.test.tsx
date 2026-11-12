// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ calls: [] as { fn: string; a: Record<string, unknown> }[] }))
vi.mock('../lib/dbChanges', () => ({ useDbChange: () => {} }))
vi.mock('../lib/format', async (orig) => ({ ...(await orig<typeof import('../lib/format')>()), todayISO: () => '2026-11-10' }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, a: Record<string, unknown>) => {
      h.calls.push({ fn, a })
      if (fn === 'report_projects') return Promise.resolve({ data: [{ project: 'CT Alpha', row_count: 3, weight_kg_sum: 9000 }, { project: 'CT Beta', row_count: 1, weight_kg_sum: 1000 }], error: null })
      if (fn === 'report_matrix') {
        const rows = a.p_by === 'project'
          ? [{ row_key: 'CT Alpha', export_type_id: 3, row_count: 2, weight_kg_sum: 8000 }, { row_key: 'CT Alpha', export_type_id: 1, row_count: 1, weight_kg_sum: 1000 }, { row_key: 'CT Beta', export_type_id: 1, row_count: 1, weight_kg_sum: 1000 }]
          : [{ row_key: '10 - Sơn, dung môi', export_type_id: 1, row_count: 1, weight_kg_sum: 500 }, { row_key: 'Mặt hàng khác', export_type_id: 1, row_count: 1, weight_kg_sum: 100 }, { row_key: '2 - Thép hình', export_type_id: 3, row_count: 1, weight_kg_sum: 1500 }]
        return Promise.resolve({ data: rows, error: null })
      }
      return Promise.resolve({ data: [], error: null })
    },
    from: (table: string) => ({
      select: () => table === 'transport_plans'
        ? { gte: () => ({ lt: () => Promise.resolve({ count: 0, error: null }) }) } // tab Tổng quan mở sẵn khi vào trang
        : { eq: () => ({ is: () => Promise.resolve({ data: [{ id: 3, name: '3 - Xuất ra công trình' }, { id: 1, name: '1 - Điều chuyển nội bộ' }, { id: 7, name: '7 - Xuất thanh lý' }], error: null }) }) },
    }),
  },
}))

import ReportPage from './ReportPage'

afterEach(() => { cleanup(); h.calls.length = 0 })

describe('Báo cáo ma trận', () => {
  it('tab "Theo nhóm hàng": hàng xếp theo số thứ tự (2 trước 10), cột theo loại hình, có tổng', async () => {
    render(<ReportPage />)
    await userEvent.click(screen.getByTestId('tab-product'))
    await waitFor(() => expect(screen.getAllByTestId('matrix-row')).toHaveLength(3))
    const rows = screen.getAllByTestId('matrix-row').map((r) => r.textContent ?? '')
    expect(rows[0]).toContain('2 - Thép hình')
    expect(rows[1]).toContain('10 - Sơn, dung môi')
    expect(rows[2]).toContain('Mặt hàng khác') // gom mặt hàng gõ tự do, luôn ở cuối
    const heads = Array.from(screen.getByTestId('matrix-table').querySelectorAll('thead th')).map((t) => t.textContent)
    expect(heads.slice(2)).toEqual(['1 - Điều chuyển nội bộ', '3 - Xuất ra công trình']) // "7 - Xuất thanh lý" không có kg → ẩn cột
    expect(screen.getByTestId('mx-kpi-row').textContent).toContain('2 - Thép hình')
    expect(screen.getByTestId('mx-kpi-row').textContent).toContain('71,4%') // 1.500 / 2.100
    expect(screen.getByTestId('mx-kpi-type').textContent).toContain('3 - Xuất ra công trình')
    expect(screen.getByTestId('mx-kpi-extra').textContent).toContain('2/24') // 2 nhóm danh mục có xuất, "Mặt hàng khác" không tính
    expect(screen.getAllByTestId('top-bar-row')[0].textContent).toContain('2 - Thép hình') // biểu đồ xếp theo khối lượng, không theo số thứ tự
    expect(screen.getByTestId('matrix-grand').textContent).toContain('2.100') // 500 + 100 + 1.500 kg
    expect(h.calls.find((c) => c.fn === 'report_matrix')?.a).toMatchObject({ p_from: '2026-01-01', p_to: '2026-11-11', p_by: 'product', p_project: null })
  })

  it('tab "Theo dự án": tự chọn dự án nhiều nhất rồi lọc theo dự án đó', async () => {
    render(<ReportPage />)
    await userEvent.click(screen.getByTestId('tab-project'))
    await waitFor(() => expect((screen.getByTestId('matrix-project') as HTMLSelectElement).value).toBe('CT Alpha'))
    await waitFor(() => expect(h.calls.some((c) => c.fn === 'report_matrix' && c.a.p_project === 'CT Alpha')).toBe(true))
    const box = screen.getByTestId('matrix-project')
    await userEvent.clear(box)
    await userEvent.type(box, 'ct bet') // gõ không dấu, thường: gợi ý ra "CT Beta"; chưa chọn thì chưa đổi dự án
    expect(h.calls.some((c) => c.a.p_project === 'CT Beta')).toBe(false)
    await userEvent.click(await screen.findByRole('option', { name: /CT Beta/ }))
    await waitFor(() => expect(h.calls.some((c) => c.fn === 'report_matrix' && c.a.p_project === 'CT Beta')).toBe(true))
  })

  it('tab "Top 10 dự án": gọi theo dự án có giới hạn 10, vẽ thanh xếp chồng mỗi dự án', async () => {
    render(<ReportPage />)
    await userEvent.click(screen.getByTestId('tab-top'))
    await waitFor(() => expect(screen.getAllByTestId('top-bar-row')).toHaveLength(2))
    expect(h.calls.find((c) => c.fn === 'report_matrix')?.a).toMatchObject({ p_by: 'project', p_limit: 10 })
    expect(screen.getAllByTestId('top-bar-row')[0].textContent).toContain('CT Alpha')
    expect(screen.getByTestId('matrix-grand').textContent).toContain('10.000')
  })

  it('thanh tab dùng được bằng bàn phím (mũi tên, chỉ tab đang chọn nằm trong thứ tự Tab) và bảng có chú giải thang màu', async () => {
    render(<ReportPage />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1'])
    tabs[0].focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByTestId('tab-product').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByTestId('tab-product'))
    await waitFor(() => expect(screen.getByTestId('matrix-legend').textContent).toContain('1.500')) // ô đậm nhất
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByTestId('tab-overview').getAttribute('aria-selected')).toBe('true')
  })

  it('rê chuột vào ô bảng: tô nhạt cả hàng và cột của ô đó, rời bảng thì bỏ', async () => {
    render(<ReportPage />)
    await userEvent.click(screen.getByTestId('tab-product'))
    await waitFor(() => expect(screen.getAllByTestId('matrix-row')).toHaveLength(3))
    const rows = screen.getAllByTestId('matrix-row') // [2 - Thép hình, 10 - Sơn, Mặt hàng khác]
    const lit = (el: Element) => (el as HTMLElement).style.backgroundImage.includes('linear-gradient')
    await userEvent.hover(rows[0].querySelectorAll('td')[2]) // cột "3 - Xuất ra công trình" của hàng 1
    expect(Array.from(rows[0].querySelectorAll('td')).every(lit)).toBe(true) // cả hàng
    expect(lit(rows[1].querySelectorAll('td')[2])).toBe(true) // cùng cột ở hàng khác
    expect(lit(rows[1].querySelectorAll('td')[1])).toBe(false) // ô khác hàng khác cột: không tô
    expect((rows[0].querySelectorAll('td')[2] as HTMLElement).style.backgroundImage).not.toBe((rows[0].querySelectorAll('td')[1] as HTMLElement).style.backgroundImage) // ô giữa dấu + đậm hơn
    expect(lit(screen.getByTestId('matrix-table').querySelectorAll('tfoot td')[2])).toBe(true) // cột sáng tới tận dòng tổng
    expect(lit(screen.getByRole('columnheader', { name: '3 - Xuất ra công trình' }))).toBe(true) // tiêu đề cột cũng được tô
    await userEvent.unhover(screen.getByTestId('matrix-table').querySelector('tbody')!)
    expect(Array.from(rows[0].querySelectorAll('td')).some(lit)).toBe(false)
  })

  it('khoảng ngày sai: báo lỗi, không gọi lại với số liệu cũ', async () => {
    render(<ReportPage />)
    await userEvent.click(screen.getByTestId('tab-product'))
    await waitFor(() => expect(screen.getAllByTestId('matrix-row').length).toBeGreaterThan(0))
    const to = screen.getByTestId('matrix-to')
    await userEvent.clear(to)
    expect((await screen.findByTestId('matrix-error')).textContent).toContain('Khoảng ngày không hợp lệ')
  })
})
