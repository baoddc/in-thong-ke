// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { useListPage } from './useListPage'
import type { ListConfig } from './listQuery'

vi.mock('./supabase', () => ({ supabase: {} }))

const cfg: ListConfig = { sorts: ['created_at'], defaultSort: 'created_at', defaultDir: 'desc', descFirst: [], filterCols: {} }
const setup = (url: string, count: number | null, rows: unknown[], table: string) => {
  const fetcher = vi.fn(() => Promise.resolve({ data: rows, count, error: null }))
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  return { fetcher, ...renderHook(() => ({ list: useListPage(cfg, fetcher, table), loc: useLocation() }), { wrapper }) }
}

describe('useListPage với tổng chạm trần (D-022)', () => {
  it('trang rỗng + tổng 10001: không nhảy về trang 201', async () => {
    const { result } = setup('/?page=300', 10001, [], 't-cap-empty')
    await waitFor(() => expect(result.current.list.loading).toBe(false))
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.loc.search).toBe('?page=300')
  })

  it('trang rỗng + tổng thật: vẫn lùi về trang cuối', async () => {
    const { result } = setup('/?page=9', 120, [], 't-exact-empty')
    await waitFor(() => expect(result.current.loc.search).toBe('?page=3'))
  })

  it('trang đầy + tổng 10001: tải sẵn trang kế', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: i }))
    const { fetcher, result } = setup('/?page=201', 10001, rows, 't-cap-full')
    await waitFor(() => expect(result.current.list.loading).toBe(false))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  })
})
