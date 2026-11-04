// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.unmock('../lib/useIncomplete')
const data = { value: [] as unknown[] }
vi.mock('../lib/supabase', () => ({ supabase: { rpc: () => Promise.resolve({ data: data.value, error: null }) } }))

import IncompleteNotice from './IncompleteNotice'

afterEach(() => { cleanup(); data.value = [] })

const FUTURE = '2999-01-01T01:00:00Z'
const PAST = '2026-11-04T01:00:00Z'
const item = (over: object) => ({ item_kind: 'plan', id: 1, label: 'TK2026/11-001', created_at: '2026-11-03T01:00:00Z', due_at: FUTURE, missing: ['Số xe'], ...over })

describe('IncompleteNotice (D-029)', () => {
  it('không có gì thiếu thì không hiện', async () => {
    render(<MemoryRouter><IncompleteNotice /></MemoryRouter>)
    await Promise.resolve()
    expect(screen.queryByTestId('incomplete-notice')).toBeNull()
  })

  it('chưa quá hạn: nhắc, bấm Xem mới ra danh sách và link tới đúng phiếu/dòng', async () => {
    data.value = [item({}), item({ item_kind: 'detail', id: 9, label: 'TK2026/11-002 · PXK 123', missing: ['ĐVT'] })]
    render(<MemoryRouter><IncompleteNotice /></MemoryRouter>)
    expect(await screen.findByText(/sẽ bị khóa thao tác khác/)).toBeTruthy()
    expect(screen.getByTestId('incomplete-notice').getAttribute('role')).toBe('status')
    await userEvent.click(screen.getByTestId('incomplete-toggle'))
    expect(screen.getByText('Phiếu TK2026/11-001').getAttribute('href')).toBe('/?q=TK2026%2F11-001&from=&to=')
    expect(screen.getByText('Dòng TK2026/11-002 · PXK 123').getAttribute('href')).toBe('/bang-kiem?q=TK2026%2F11-002&from=&to=')
  })

  it('quá hạn: báo đang bị khóa và luôn hiện danh sách', async () => {
    data.value = [item({ due_at: PAST })]
    render(<MemoryRouter><IncompleteNotice /></MemoryRouter>)
    expect(await screen.findByText(/khóa thao tác/)).toBeTruthy()
    expect(screen.getByTestId('incomplete-notice').getAttribute('role')).toBe('alert')
    expect(screen.queryByTestId('incomplete-toggle')).toBeNull()
    expect(screen.getByText('Phiếu TK2026/11-001')).toBeTruthy()
  })
})
