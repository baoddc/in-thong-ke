import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ calls: [] as [string, Record<string, unknown>][], result: { data: 7 as unknown, error: null as { message: string } | null } }))
vi.mock('./supabase', () => ({ supabase: { rpc: (fn: string, args: Record<string, unknown>) => { h.calls.push([fn, args]); return Promise.resolve(h.result) } } }))

import { rpcCount, rpcList } from './listRpc'
import type { ListParams } from './listQuery'

const p: ListParams = { page: 3, size: 25, q: ' a,(b)% ', from: '2026-10-01', to: '', sort: 'tk_number', dir: 'asc', filters: {} }

beforeEach(() => { h.calls.length = 0; h.result = { data: 7, error: null } })

describe('rpcCount', () => {
  it('gọi RPC đếm với đúng bộ lọc của rpcList (q làm sạch, rỗng → null), không sắp xếp/phân trang', async () => {
    expect(await rpcCount('count_inspection_details', p, { p_export_type_id: 3, p_product_id: null })).toBe(7)
    void rpcList('list_inspection_details', p, { p_export_type_id: 3, p_product_id: null })
    const [count, list] = h.calls
    expect(count).toEqual(['count_inspection_details', { p_q: 'a b', p_from: '2026-10-01', p_to: null, p_export_type_id: 3, p_product_id: null }])
    expect(list[1]).toMatchObject(count[1])
  })

  it('bigint dạng chuỗi → số; lỗi hoặc dữ liệu rỗng → null', async () => {
    h.result = { data: '16500', error: null }
    expect(await rpcCount('count_transport_plans', p)).toBe(16500)
    h.result = { data: null, error: { message: 'boom' } }
    expect(await rpcCount('count_transport_plans', p)).toBeNull()
    h.result = { data: null, error: null }
    expect(await rpcCount('count_transport_plans', p)).toBeNull()
  })
})
