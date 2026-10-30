// T-025 (tester): ca biên số/ngày/phân trang/in. `it.fails` = lỗi đã biết (xem docs/test-report.md); khi lỗi được sửa test này sẽ báo đỏ -> đổi thành `it`.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { errorMessage, formatDate, formatNumber, parseVnNumber, todayISO } from './format'
import { parseDisplayDate } from './date'
import { monthRange, pageRange, parseListParams, type ListConfig } from './listQuery'
import { carrierList, countSlips, formatFixed2, sumField } from './printSummary'
import type { InspectionRow } from '../types/inspection'

afterEach(() => vi.useRealTimers())

describe('ngày biên', () => {
  it.each([
    ['29/02/2024', '2024-02-29'], ['29/02/2028', '2028-02-29'], ['31/12/2026', '2026-12-31'], ['01/01/2027', '2027-01-01'],
    ['1/1/2026', '2026-01-01'], [' 12/10/2026 ', '2026-10-12'],
  ])('%s hợp lệ → %s', (s, iso) => expect(parseDisplayDate(s)).toBe(iso))

  const invalidDates = ['29/02/2100', '29/02/2026', '30/02/2024', '31/04/2026', '31/06/2026', '31/09/2026', '31/11/2026', '00/01/2026', '32/01/2026', '01/00/2026', '01/13/2026', '012/10/2026', '12/10/2026x', '12-10-2026']
  it.each(invalidDates)('%s không có thật → null', (s) => expect(parseDisplayDate(s)).toBeNull())

  it('formatDate: chuỗi ngày thuần không bị lệch múi giờ, cuối năm/đầu năm', () => {
    expect(formatDate('2026-12-31')).toBe('31/12/2026')
    expect(formatDate('2027-01-01')).toBe('01/01/2027')
    expect(formatDate('2028-02-29')).toBe('29/02/2028')
    expect(formatDate('')).toBe('')
  })

  it('todayISO theo giờ Việt Nam: 17:30 UTC 31/12 đã là 01/01 năm sau; monthRange qua năm', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-31T17:30:00Z'))
    expect(todayISO()).toBe('2027-01-01')
    expect(monthRange(todayISO())).toEqual(['2027-01-01', '2027-02-01'])
    vi.setSystemTime(new Date('2026-12-31T16:59:00Z'))
    expect(todayISO()).toBe('2026-12-31')
  })
})

describe('parseVnNumber - ca biên', () => {
  it('0 và 0,0 là số 0 (không phải trống)', () => {
    expect(parseVnNumber('0')).toBe(0)
    expect(parseVnNumber('0,0')).toBe(0)
  })
  it('số lớn đúng quy tắc VN', () => {
    expect(parseVnNumber('246.043.357,56')).toBe(246043357.56)
    expect(parseVnNumber('999.999.999.999,999')).toBe(999999999999.999)
  })
  it.each(['1,234.56', '1.234,56,7', '.5', ',5', '5.', '1..234', '1.2345', '١٢٣', '1e5', '0x10', '+5', 'Infinity'])('"%s" → NaN', (s) => expect(parseVnNumber(s)).toBeNaN())

  // LỖI THẤP: "0.500" (người dùng muốn gõ 0,5 kiểu Anh) bị đọc thành 500 vì "0" + nhóm nghìn "500". Nên từ chối nhóm đầu bắt đầu bằng 0.
  it.fails('"0.500" phải bị từ chối (đang ra 500)', () => expect(parseVnNumber('0.500')).toBeNaN())
  // LỖI THẤP: không chặn số vượt numeric(18,3) -> DB báo "numeric field overflow" (thông báo tiếng Anh hiện ra thô).
  it.fails('số lớn hơn giới hạn cột numeric(18,3) phải bị từ chối ở FE', () => expect(parseVnNumber('1' + '.000'.repeat(7))).toBeNaN())
})

describe('formatNumber / formatFixed2', () => {
  it('0 hiện "0" (không phải rỗng); số âm giữ dấu; tổng lớn đúng định dạng VN', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(-1.5)).toBe('-1,5')
    expect(formatNumber(246043357.56)).toBe('246.043.357,56')
    expect(formatFixed2(0)).toBe('0,00')
    expect(formatFixed2(246043357.56)).toBe('246.043.357,56')
  })
  it('round-trip dữ liệu có 3 chữ số thập phân (numeric 18,3)', () => {
    for (const n of [0.001, 12500.94, 1234567.891, 999999999999.999]) expect(parseVnNumber(formatNumber(n))).toBe(n)
  })
})

describe('bản in - tổng', () => {
  const r = (o: Partial<InspectionRow>) => o as InspectionRow
  it('cộng số thập phân không bị lệch dấu phẩy động khi hiển thị', () => {
    expect(formatFixed2(sumField([r({ total_weight_kg: 0.1 }), r({ total_weight_kg: 0.2 })], 'total_weight_kg'))).toBe('0,30')
    const many = Array.from({ length: 1000 }, () => r({ total_weight_kg: 0.1 }))
    expect(formatFixed2(sumField(many, 'total_weight_kg'))).toBe('100,00')
  })
  it('không có dòng nào: tổng 0,00, số phiếu 0, nhà xe rỗng', () => {
    expect(formatFixed2(sumField([], 'total_weight_kg'))).toBe('0,00')
    expect(countSlips([])).toBe(0)
    expect(carrierList([])).toBe('')
  })
  it('Tổng số phiếu = số "Số phiếu xuất kho" khác nhau: bỏ trống/khoảng trắng, trùng sau trim; phân biệt hoa/thường', () => {
    const rows = [' A1 ', 'A1', 'A2', '', '   ', null, 'a1'].map((s) => r({ warehouse_slip_no: s }))
    expect(countSlips(rows)).toBe(3) // A1, A2, a1
  })
})

describe('thông báo lỗi', () => {
  it('P0001 giữ nguyên nội dung tiếng Việt từ RPC', () => {
    expect(errorMessage({ code: 'P0001', message: 'Đã hết số phiếu thống kê trong tháng 10/2026' })).toContain('Đã hết số phiếu')
  })
  it('null/undefined → chuỗi rỗng', () => {
    expect(errorMessage(null)).toBe('')
    expect(errorMessage(undefined)).toBe('')
  })
})

describe('phân trang - ca biên', () => {
  const cfg: ListConfig = { sorts: ['created_at'], defaultSort: 'created_at', defaultDir: 'desc', filterCols: {} }
  const parse = (qs: string) => parseListParams(new URLSearchParams(qs), cfg)
  it('page=0, âm, chữ → về trang 1; size ngoài danh sách → 50', () => {
    for (const q of ['page=0', 'page=-1', 'page=abc', 'page=']) expect(parse(q).page).toBe(1)
    expect(parse('size=1000000').size).toBe(50)
  })
  it('trang cuối của 41.799 dòng/50 = trang 836, range 41750..41799', () => {
    expect(pageRange(836, 50)).toEqual([41750, 41799])
  })
  it('ngày lọc sai định dạng bị bỏ (không đưa lên query)', () => {
    expect(parse('from=2026-13-45x&to=29/10/2026')).toMatchObject({ from: '', to: '' })
  })
  // LỖI THẤP: URL ?page=99999999999999999999 cho offset 5e21 (không phải số nguyên an toàn) -> PostgREST trả 400; nên chặn trần.
  it.fails('page quá lớn bị chặn về số nguyên an toàn', () => {
    expect(Number.isSafeInteger(pageRange(parse('page=99999999999999999999').page, 50)[0])).toBe(true)
  })
})
