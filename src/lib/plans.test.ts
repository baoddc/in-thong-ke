import { describe, expect, it } from 'vitest'
import { mergeShippers, pickShipper, planShipperId, shipperIdToSave } from './plans'
import { parseVnNumber, formatNumber } from './format'

const mat = (id: number, name: string, sort_order: number | null) => ({ sort_order, lookup: { id, name } })

describe('pickShipper', () => {
  it('ưu tiên NV xuất TP/BTP', () => {
    expect(pickShipper({ fg_exporter: { name: 'Lan' }, material_exporters: [mat(1, 'An', 1)] })).toBe('Lan')
  })
  it('không có TP/BTP → NV xuất VT có sort_order nhỏ nhất', () => {
    expect(pickShipper({ fg_exporter: null, material_exporters: [mat(2, 'Bình', 2), mat(1, 'An', 1)] })).toBe('An')
  })
  it('không có ai → chuỗi rỗng', () => {
    expect(pickShipper({ fg_exporter: null, material_exporters: [] })).toBe('')
  })
})

describe('mergeShippers', () => {
  it('gộp TP/BTP + VT, trùng tên chỉ giữ mục TP/BTP', () => {
    const r = mergeShippers([{ id: 1, name: 'Lan' }, { id: 2, name: 'An' }], [{ id: 3, name: 'an ' }, { id: 4, name: 'Bình' }])
    expect(r.map((i) => i.id)).toEqual([1, 2, 4])
  })
})

describe('planShipperId', () => {
  const list = [{ id: 1, name: 'Lan' }, { id: 4, name: 'Bình' }]
  it('tìm id theo tên người theo phiếu (không phân biệt hoa thường)', () => {
    expect(planShipperId(list, { fg_exporter: { name: 'lan' }, material_exporters: [] })).toBe(1)
    expect(planShipperId(list, { fg_exporter: null, material_exporters: [mat(4, 'Bình', 1)] })).toBe(4)
  })
  it('không có phiếu/không khớp → null', () => {
    expect(planShipperId(list, null)).toBeNull()
    expect(planShipperId(list, { fg_exporter: { name: 'Khác' }, material_exporters: [] })).toBeNull()
  })
})

describe('shipperIdToSave', () => {
  it('trống hoặc trùng người theo phiếu → null; khác → id', () => {
    expect(shipperIdToSave(null, 1)).toBeNull()
    expect(shipperIdToSave(1, 1)).toBeNull()
    expect(shipperIdToSave(4, 1)).toBe(4)
    expect(shipperIdToSave(4, null)).toBe(4)
  })
})

describe('parseVnNumber', () => {
  it.each([
    ['5,5', 5.5],
    ['1.234,5', 1234.5],
    ['1.234', 1234],
    ['1.234.567,89', 1234567.89],
    ['12', 12],
    [' 7 ', 7],
  ])('%s → %s', (s, n) => expect(parseVnNumber(s)).toBe(n))
  it('rỗng → null', () => expect(parseVnNumber('  ')).toBeNull())
  it.each(['-5', 'abc', '1,2,3', '5,', '5.5', '1.23', '12.5000'])('%s → NaN', (s) => expect(parseVnNumber(s)).toBeNaN())
  it.each([12500.94, 0.5, 1234567.891])('round-trip formatNumber → parseVnNumber: %s', (n) => expect(parseVnNumber(formatNumber(n))).toBe(n))
})

describe('formatNumber', () => {
  it('kiểu VN, tối đa 3 chữ số thập phân', () => {
    expect(formatNumber(1234.5)).toBe('1.234,5')
    expect(formatNumber(0.12345)).toBe('0,123')
    expect(formatNumber(null)).toBe('')
  })
})
