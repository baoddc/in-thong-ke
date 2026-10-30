import { afterEach, describe, expect, it, vi } from 'vitest'
import { cacheGeneration, cacheGet, cacheKey, cacheSet, clearListCache } from './listCache'
import { parseListParams, type ListConfig } from './listQuery'

const cfg: ListConfig = { sorts: ['created_at'], defaultSort: 'created_at', defaultDir: 'desc', searchCols: [], dateCol: 'd', filterCols: {}, tiebreak: 'id' }
const params = (qs: string) => parseListParams(new URLSearchParams(qs), cfg)
const page = (n: number) => ({ rows: [n], total: n })

afterEach(() => { clearListCache(); vi.useRealTimers() })

describe('listCache (D-017)', () => {
  it('khóa khác nhau theo bảng, bộ lọc, sắp xếp và trang', () => {
    const keys = [cacheKey('a', params('')), cacheKey('b', params('')), cacheKey('a', params('q=x')), cacheKey('a', params('page=2')), cacheKey('a', params('sort=created_at&dir=asc'))]
    expect(new Set(keys).size).toBe(5)
  })

  it('hết hạn sau 60 s', () => {
    vi.useFakeTimers()
    cacheSet('k', page(1), cacheGeneration())
    vi.advanceTimersByTime(59_000)
    expect(cacheGet('k')?.value).toEqual(page(1))
    vi.advanceTimersByTime(2_000)
    expect(cacheGet('k')).toBeUndefined()
  })

  it('giữ tối đa 30 mục, bỏ mục cũ nhất', () => {
    for (let i = 0; i < 31; i++) cacheSet(`k${i}`, page(i), cacheGeneration())
    expect(cacheGet('k0')).toBeUndefined()
    expect(cacheGet('k1')).toBeDefined()
    expect(cacheGet('k30')).toBeDefined()
  })

  it('xóa cache; request bắt đầu trước khi xóa không ghi đè dữ liệu cũ vào lại', () => {
    const started = cacheGeneration()
    cacheSet('k', page(1), started)
    clearListCache()
    expect(cacheGet('k')).toBeUndefined()
    cacheSet('k', page(2), started) // kết quả muộn của request cũ
    expect(cacheGet('k')).toBeUndefined()
    cacheSet('k', page(3), cacheGeneration())
    expect(cacheGet('k')).toBeDefined()
  })
})
