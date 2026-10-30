import { describe, expect, it } from 'vitest'
import { errorMessage, formatDate } from './format'

describe('formatDate', () => {
  it('đổi yyyy-MM-dd sang dd/MM/yyyy', () => expect(formatDate('2026-10-05')).toBe('05/10/2026'))
  it('trống thì trả chuỗi rỗng', () => expect(formatDate(null)).toBe(''))
})

describe('errorMessage', () => {
  it('23505', () => expect(errorMessage({ code: '23505' })).toBe('Mục này đã có.'))
  it('23503', () => expect(errorMessage({ code: '23503' })).toContain('không xóa được'))
  it('lỗi khác giữ nội dung', () => expect(errorMessage({ message: 'x' })).toContain('x'))
})
