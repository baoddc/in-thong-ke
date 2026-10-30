import { describe, expect, it } from 'vitest'
import { compareNames, filterSuggestions, findIdByName, hasExactMatch, normalize } from './lookupMatch'

const items = [{ id: 1, name: 'Xe Tải 51C' }, { id: 2, name: 'TX ĐƯỢC' }, { id: 3, name: 'Nguyễn Văn Sáu' }, { id: 4, name: 'Đặng Văn Bảy' }]

describe('findIdByName', () => {
  it('khớp không phân biệt hoa thường và bỏ khoảng trắng đầu/cuối', () => {
    expect(findIdByName(items, '  xe tải 51c ')).toBe(1)
    expect(findIdByName(items, 'tx được')).toBe(2)
  })
  it('không có trong danh mục hoặc trống thì trả null', () => {
    expect(findIdByName(items, 'xe lạ')).toBeNull()
    expect(findIdByName(items, '   ')).toBeNull()
  })
})

describe('normalize', () => {
  it('bỏ dấu, đ→d, chữ thường', () => {
    expect(normalize(' Đặng Văn ')).toBe('dang van')
  })
})

describe('filterSuggestions', () => {
  it('không phân biệt dấu và hoa thường', () => {
    expect(filterSuggestions(items, 'nguyen van').map((i) => i.id)).toEqual([3])
    expect(filterSuggestions(items, 'dang').map((i) => i.id)).toEqual([4])
    expect(filterSuggestions(items, 'van').map((i) => i.id)).toEqual([3, 4])
  })
  it('rỗng thì không gợi ý; giới hạn số mục; loại mục đã chọn', () => {
    expect(filterSuggestions(items, '  ')).toEqual([])
    const many = Array.from({ length: 50 }, (_, n) => ({ id: n, name: `Xe ${n}` }))
    expect(filterSuggestions(many, 'xe')).toHaveLength(20)
    expect(filterSuggestions(many, 'xe', 5)).toHaveLength(5)
    expect(filterSuggestions(items, 'van', 20, [3]).map((i) => i.id)).toEqual([4])
  })
})

describe('compareNames', () => {
  it('sắp số theo giá trị, không theo chữ', () => {
    const l = [{ id: 1, name: '10 - a' }, { id: 2, name: '2 - b' }, { id: 3, name: '1 - c' }, { id: 4, name: '12 - d' }]
    expect(l.sort(compareNames).map((i) => i.name.split(' ')[0])).toEqual(['1', '2', '10', '12'])
  })
  it('tên có dấu không lỗi; hòa thì theo id', () => {
    const l = [{ id: 2, name: 'Dương' }, { id: 1, name: 'Đặng' }, { id: 4, name: 'a' }, { id: 3, name: 'A' }]
    expect(l.sort(compareNames).map((i) => i.id)).toEqual([3, 4, 2, 1])
  })
})

describe('hasExactMatch', () => {
  it('trùng khít (trim, không phân biệt hoa thường) thì không cần thêm mới', () => {
    expect(hasExactMatch(items, ' nguyễn văn sáu ')).toBe(true)
    expect(hasExactMatch(items, 'nguyen van sau')).toBe(false) // gần khớp nhưng không khít → vẫn cho thêm
    expect(hasExactMatch(items, 'Nguyễn Văn')).toBe(false)
  })
})
