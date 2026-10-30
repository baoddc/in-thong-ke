import { describe, expect, it } from 'vitest'
import { maskDateInput, parseDisplayDate } from './date'

describe('maskDateInput', () => {
  it('tự chèn "/" khi gõ liên tục', () => {
    expect(maskDateInput('1')).toBe('1')
    expect(maskDateInput('12')).toBe('12')
    expect(maskDateInput('121')).toBe('12/1')
    expect(maskDateInput('1210')).toBe('12/10')
    expect(maskDateInput('12102')).toBe('12/10/2')
    expect(maskDateInput('12102026')).toBe('12/10/2026')
  })
  it('xóa lùi qua dấu "/" và bỏ ký tự thừa', () => {
    expect(maskDateInput('12')).toBe('12') // xóa lùi qua "12/" → "12"
    expect(maskDateInput('12/')).toBe('12')
    expect(maskDateInput('31/022')).toBe('31/02/2') // chữ số gõ tiếp sau "/" tự chèn
    expect(maskDateInput('12/10/')).toBe('12/10')
    expect(maskDateInput('121020261')).toBe('12/10/2026')
    expect(maskDateInput('ab')).toBe('')
  })
  it('gõ sẵn dấu phân cách thì bù số 0', () => {
    expect(maskDateInput('1/')).toBe('01/')
    expect(maskDateInput('1/2')).toBe('01/2')
    expect(maskDateInput('1/2/2026')).toBe('01/02/2026')
    expect(maskDateInput('12-10-2026')).toBe('12/10/2026')
  })
  it('dán ISO thì đổi sang dd/mm/yyyy', () => {
    expect(maskDateInput('2026-10-12')).toBe('12/10/2026')
  })
})

describe('parseDisplayDate', () => {
  it('ngày hợp lệ → ISO', () => {
    expect(parseDisplayDate('12/10/2026')).toBe('2026-10-12')
    expect(parseDisplayDate('1/2/2026')).toBe('2026-02-01')
    expect(parseDisplayDate('29/02/2024')).toBe('2024-02-29')
  })
  it('rỗng → ""', () => {
    expect(parseDisplayDate('')).toBe('')
    expect(parseDisplayDate('  ')).toBe('')
  })
  it('ngày không có thật hoặc chưa đủ → null', () => {
    expect(parseDisplayDate('31/02/2026')).toBeNull()
    expect(parseDisplayDate('29/02/2026')).toBeNull()
    expect(parseDisplayDate('00/10/2026')).toBeNull()
    expect(parseDisplayDate('12/13/2026')).toBeNull()
    expect(parseDisplayDate('12/10')).toBeNull()
    expect(parseDisplayDate('12/10/26')).toBeNull()
    expect(parseDisplayDate('12/10/1800')).toBeNull()
  })
})
