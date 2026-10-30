import { describe, expect, it } from 'vitest'
import { BADGE_TONES, badgeTone, hashString, initials } from './badgeColor'

describe('badgeTone', () => {
  it('ổn định: cùng tên (khác hoa/thường, khoảng trắng) → cùng màu', () => {
    expect(badgeTone('Xe thuê')).toBe(badgeTone('  XE THUÊ '))
    expect(badgeTone('Nội bộ')).toBe(badgeTone('Nội bộ'))
  })
  it('luôn trả về một trong các tông có sẵn, kể cả chuỗi rỗng', () => {
    for (const n of ['', 'a', 'Điều chuyển nội bộ', '1- Bán hàng', 'Xe máy']) expect(BADGE_TONES).toContain(badgeTone(n))
  })
  it('các tên khác nhau phân bố trên nhiều màu', () => {
    const names = ['Tôn', 'Thép hộp', 'Ống', 'Bulong', 'Sơn', 'Xà gồ', 'Tấm lợp', 'Phụ kiện', 'Dầm', 'Cột']
    expect(new Set(names.map(badgeTone)).size).toBeGreaterThan(3)
  })
  it('hashString xác định', () => {
    expect(hashString('abc')).toBe(hashString('abc'))
    expect(hashString('abc')).not.toBe(hashString('abd'))
  })
})

describe('initials', () => {
  it('chữ đầu của họ và tên', () => {
    expect(initials('Trần Văn Bình')).toBe('TB')
    expect(initials('TX ĐƯỢC')).toBe('TĐ')
    expect(initials('  an ')).toBe('A')
    expect(initials('')).toBe('')
  })
})
