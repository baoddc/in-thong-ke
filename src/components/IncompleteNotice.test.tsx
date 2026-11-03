// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

const data = { value: [] as unknown[] }
vi.mock('../lib/supabase', () => ({ supabase: { rpc: () => Promise.resolve({ data: data.value, error: null }) } }))

import IncompleteNotice from './IncompleteNotice'

afterEach(() => { cleanup(); data.value = [] })

describe('IncompleteNotice (D-027)', () => {
  it('không có gì thiếu thì không hiện', async () => {
    render(<MemoryRouter><IncompleteNotice /></MemoryRouter>)
    await Promise.resolve()
    expect(screen.queryByTestId('incomplete-notice')).toBeNull()
  })

  it('liệt kê phiếu/dòng thiếu, hạn xóa và phiếu đã có dòng thì không xóa', async () => {
    data.value = [
      { item_kind: 'plan', id: 1, label: 'TK2026/11-001', created_at: '2026-11-03T01:00:00Z', delete_at: '2026-11-04T01:00:00Z', missing: ['Số xe'] },
      { item_kind: 'plan', id: 2, label: 'TK2026/11-002', created_at: '2026-11-03T01:00:00Z', delete_at: null, missing: ['Tài xế/ phụ xe'] },
      { item_kind: 'detail', id: 9, label: 'TK2026/11-002 · PXK 123', created_at: '2026-11-03T01:00:00Z', delete_at: '2026-11-04T01:00:00Z', missing: ['ĐVT'] },
    ]
    render(<MemoryRouter><IncompleteNotice /></MemoryRouter>)
    expect(await screen.findByText(/2 phiếu và 1 dòng bảng kiểm/)).toBeTruthy()
    await userEvent.click(screen.getByTestId('incomplete-toggle'))
    expect(screen.getByText('Phiếu TK2026/11-001').getAttribute('href')).toBe('/?q=TK2026%2F11-001&from=&to=')
    expect(screen.getByText('Dòng TK2026/11-002 · PXK 123').getAttribute('href')).toBe('/bang-kiem?q=TK2026%2F11-002&from=&to=')
    expect(screen.getAllByText(/Tự xóa lúc .*04\/11/)).toHaveLength(2)
    expect(screen.getByText(/không bị xóa/)).toBeTruthy()
  })
})
