import { describe, expect, it } from 'vitest'
import { applyFilters, applyList, hasActiveFilters, monthRange, nextSort, pageCount, pageRange, parseListParams, sanitizeTerm, toSearchParams, type ListConfig } from './listQuery'

const cfg: ListConfig = {
  sorts: ['created_at', 'export_date', 'tk_number'], defaultSort: 'created_at', defaultDir: 'desc', descFirst: ['export_date'],
  searchCols: ['tk_number', 'construction_name'], dateCol: 'export_date', filterCols: { type: 'export_type_id' }, tiebreak: 'id',
}
const parse = (qs: string) => parseListParams(new URLSearchParams(qs), cfg)

// Builder giả ghi lại các lời gọi theo thứ tự.
function fakeBuilder() {
  const calls: unknown[][] = []
  const b: Record<string, unknown> = {}
  for (const m of ['or', 'gte', 'lte', 'eq', 'order', 'range']) b[m] = (...a: unknown[]) => { calls.push([m, ...a]); return b }
  return { b, calls }
}

describe('parseListParams / toSearchParams', () => {
  it('mặc định: trang 1, 50 dòng, sắp theo mặc định', () => {
    expect(parse('')).toEqual({ page: 1, size: 50, q: '', from: '', to: '', sort: 'created_at', dir: 'desc', filters: { type: '' } })
  })

  it('giá trị sai bị bỏ về mặc định (cỡ trang, cột sắp xếp, ngày, id lọc)', () => {
    const p = parse('page=-3&size=7&sort=drop_table&from=1/2/2026&type=abc')
    expect(p).toMatchObject({ page: 1, size: 50, sort: 'created_at', from: '', filters: { type: '' } })
  })

  it('đọc đủ các tham số hợp lệ', () => {
    const p = parse('q=%20TK01%20&from=2026-10-01&to=2026-10-31&sort=export_date&dir=asc&page=3&size=100&type=5')
    expect(p).toEqual({ page: 3, size: 100, q: 'TK01', from: '2026-10-01', to: '2026-10-31', sort: 'export_date', dir: 'asc', filters: { type: '5' } })
  })

  it('ghi lại URL gọn: bỏ giá trị mặc định, đọc lại ra cùng kết quả', () => {
    expect(toSearchParams(parse(''), cfg).toString()).toBe('')
    const p = { ...parse(''), q: 'abc', page: 2, size: 25 as number, sort: 'tk_number', dir: 'asc' as const, filters: { type: '9' } }
    const qs = toSearchParams(p, cfg).toString()
    expect(qs).toContain('q=abc')
    expect(qs).toContain('page=2')
    expect(parse(qs)).toEqual(p)
  })

  it('hasActiveFilters không tính sắp xếp/phân trang', () => {
    expect(hasActiveFilters(parse('page=2&sort=tk_number'))).toBe(false)
    expect(hasActiveFilters(parse('q=a'))).toBe(true)
    expect(hasActiveFilters(parse('type=3'))).toBe(true)
  })
})

describe('applyList', () => {
  it('mặc định chỉ sắp xếp + phân trang trang 1 (0..49)', () => {
    const { b, calls } = fakeBuilder()
    applyList(b, parse(''), cfg)
    expect(calls).toEqual([
      ['order', 'created_at', { ascending: false, nullsFirst: false }],
      ['order', 'id', { ascending: false }],
      ['range', 0, 49],
    ])
  })

  it('tìm nhanh = ilike trên mọi cột, khoảng ngày, lọc id, trang 3 cỡ 25', () => {
    const { b, calls } = fakeBuilder()
    applyList(b, parse('q=TK01&from=2026-10-01&to=2026-10-31&type=5&sort=tk_number&dir=asc&page=3&size=25'), cfg)
    expect(calls).toEqual([
      ['or', 'tk_number.ilike.%TK01%,construction_name.ilike.%TK01%'],
      ['gte', 'export_date', '2026-10-01'],
      ['lte', 'export_date', '2026-10-31'],
      ['eq', 'export_type_id', 5],
      ['order', 'tk_number', { ascending: true, nullsFirst: false }],
      ['order', 'id', { ascending: true }], // khóa phụ cùng chiều với cột sắp xếp
      ['range', 50, 74],
    ])
  })

  it('applyFilters (dùng cho request đếm) chỉ lọc, không sắp xếp/phân trang; khớp phần lọc của applyList', () => {
    const qs = 'q=TK01&from=2026-10-01&to=2026-10-31&type=5&page=3&size=25'
    const a = fakeBuilder(); applyFilters(a.b, parse(qs), cfg)
    const l = fakeBuilder(); applyList(l.b, parse(qs), cfg)
    expect(a.calls.map((c) => c[0])).toEqual(['or', 'gte', 'lte', 'eq'])
    expect(l.calls.slice(0, 4)).toEqual(a.calls)
  })

  it('chuỗi tìm chỉ toàn ký tự đặc biệt thì không thêm điều kiện or', () => {
    const { b, calls } = fakeBuilder()
    applyList(b, { ...parse(''), q: ',(%)' }, cfg)
    expect(calls.some((c) => c[0] === 'or')).toBe(false)
  })
})

describe('tiện ích', () => {
  it('sanitizeTerm bỏ ký tự phá cú pháp or(...)', () => {
    expect(sanitizeTerm(' a,b (c) "d" 50% x*y ')).toBe('a b c d 50 x y')
  })

  it('nextSort: cột mới theo chiều đầu tiên của cột; cột đang sắp thì đảo', () => {
    expect(nextSort({ sort: 'created_at', dir: 'desc' }, 'export_date', cfg)).toEqual({ sort: 'export_date', dir: 'desc' })
    expect(nextSort({ sort: 'created_at', dir: 'desc' }, 'tk_number', cfg)).toEqual({ sort: 'tk_number', dir: 'asc' })
    expect(nextSort({ sort: 'tk_number', dir: 'asc' }, 'tk_number', cfg)).toEqual({ sort: 'tk_number', dir: 'desc' })
  })

  it('pageCount / pageRange', () => {
    expect(pageCount(0, 50)).toBe(1)
    expect(pageCount(16500, 50)).toBe(330)
    expect(pageCount(101, 50)).toBe(3)
    expect(pageRange(1, 50)).toEqual([0, 49])
    expect(pageRange(330, 50)).toEqual([16450, 16499])
  })

  it('monthRange: [đầu tháng, đầu tháng sau), qua năm mới', () => {
    expect(monthRange('2026-10-29')).toEqual(['2026-10-01', '2026-11-01'])
    expect(monthRange('2026-12-31')).toEqual(['2026-12-01', '2027-01-01'])
  })
})
