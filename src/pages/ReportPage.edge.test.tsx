// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ mode: 'empty' as 'empty' | 'error' }))
vi.mock('../lib/dbChanges', () => ({ useDbChange: () => {} }))
vi.mock('../lib/format', async (orig) => ({ ...(await orig<typeof import('../lib/format')>()), todayISO: () => '2026-11-10' }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve(h.mode === 'error' ? { data: null, error: { message: 'boom' } } : { data: [], error: null }),
    from: () => ({ select: () => ({ gte: () => ({ lt: () => Promise.resolve({ count: 0, error: null }) }) }) }),
  },
}))

import ReportPage from './ReportPage'

afterEach(cleanup)

describe('ReportPage biên', () => {
  it('năm không có dữ liệu: báo "chưa có dữ liệu", không NaN/Infinity', async () => {
    h.mode = 'empty'
    render(<ReportPage />)
    await waitFor(() => expect(screen.getByText(/chưa có dữ liệu/)).toBeTruthy())
    const text = screen.getByTestId('report-page').textContent ?? ''
    expect(text).not.toMatch(/NaN|Infinity/)
    expect(screen.getByTestId('kpi-peak').textContent).toContain('—')
    expect(screen.getAllByTestId(/^month-/)).toHaveLength(12)
  })

  it('RPC lỗi: hiện thông báo lỗi tiếng Việt, không hiện "chưa có dữ liệu"', async () => {
    h.mode = 'error'
    render(<ReportPage />)
    await waitFor(() => expect(screen.getByTestId('report-error').textContent).toContain('Không tải được'))
    expect(screen.queryByText(/chưa có dữ liệu/)).toBeNull() 
  })
})
