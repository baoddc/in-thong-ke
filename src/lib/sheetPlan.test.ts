import { describe, expect, it } from 'vitest'
import { idMap, planChanges, safe, type Row } from '../../supabase/functions/sheets-sync/plan'

const row = (id: number, ...rest: (string | number | null)[]): Row => [id, ...rest]

describe('idMap', () => {
  it('cột A → id → số hàng; bỏ tiêu đề, ô trống, giá trị lạ; id trùng giữ hàng đầu', () => {
    const m = idMap([['ID'], ['10'], [], ['abc'], ['20'], ['10'], ['0']])
    expect([...m]).toEqual([[10, 2], [20, 5]])
  })
  it('tab trống', () => { expect(idMap(undefined).size).toBe(0) })
})

describe('planChanges', () => {
  const rowOf = new Map([[10, 2], [20, 3], [30, 4]])

  it('id đã có → sửa đúng hàng; id mới → thêm cuối', () => {
    const p = planChanges(rowOf, [row(20, 'mới'), row(40, 'x')], [20, 40], [])
    expect(p.updates).toEqual([{ row: 3, values: [20, 'mới'] }])
    expect(p.appends).toEqual([[40, 'x']])
    expect(p.deleteRows).toEqual([])
  })

  it('xóa: hàng xếp giảm dần để xóa từ dưới lên không lệch số hàng; id không có trong Sheet thì bỏ qua', () => {
    const p = planChanges(rowOf, [], [], [10, 30, 99])
    expect(p.deleteRows).toEqual([4, 2])
  })

  it('cần cập nhật nhưng database không còn dòng (xóa chen giữa) → xóa khỏi Sheet', () => {
    const p = planChanges(rowOf, [row(10, 'a')], [10, 20], [])
    expect(p.updates).toEqual([{ row: 2, values: [10, 'a'] }])
    expect(p.deleteRows).toEqual([3])
  })
})

describe('safe', () => {
  it('chữ bắt đầu bằng = + - @ thành chữ thường (không thành công thức); còn lại giữ nguyên', () => {
    expect(['=SUM(A1)', '+1', '-1', '@x'].map(safe)).toEqual(["'=SUM(A1)", "'+1", "'-1", "'@x"])
    expect([safe('bình thường'), safe(5), safe(null)]).toEqual(['bình thường', 5, null])
  })
})
