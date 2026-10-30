import { describe, expect, it } from 'vitest'
import { canEditRow, toLoginEmail, userActions, type Profile } from './auth'

const H = 3_600_000
const now = Date.parse('2026-10-30T12:00:00Z')
const at = (hoursAgo: number) => new Date(now - hoursAgo * H).toISOString()
const user = { id: 'u1', role: 'user', is_active: true } satisfies Pick<Profile, 'id' | 'role' | 'is_active'>
const admin = { id: 'a1', role: 'admin', is_active: true } satisfies Pick<Profile, 'id' | 'role' | 'is_active'>

describe('canEditRow', () => {
  it('admin luôn được, kể cả dòng cũ hoặc không có người tạo', () => {
    expect(canEditRow(admin, 'u1', at(1000), now)).toBe(true)
    expect(canEditRow(admin, null, null, now)).toBe(true)
  })
  it('người tạo: được khi < 24 giờ, đúng 24 giờ hoặc quá hạn thì không', () => {
    expect(canEditRow(user, 'u1', at(1), now)).toBe(true)
    expect(canEditRow(user, 'u1', at(23.99), now)).toBe(true)
    expect(canEditRow(user, 'u1', at(24), now)).toBe(false)
    expect(canEditRow(user, 'u1', at(25), now)).toBe(false)
  })
  it('người khác, created_by null, thiếu created_at, chưa đăng nhập, tài khoản khóa → không', () => {
    expect(canEditRow(user, 'u2', at(1), now)).toBe(false)
    expect(canEditRow(user, null, at(1), now)).toBe(false)
    expect(canEditRow(user, 'u1', null, now)).toBe(false)
    expect(canEditRow(null, 'u1', at(1), now)).toBe(false)
    expect(canEditRow({ ...admin, is_active: false }, 'a1', at(1), now)).toBe(false)
  })
  it('nhận cả Date cho now', () => {
    expect(canEditRow(user, 'u1', at(2), new Date(now))).toBe(true)
  })
})

describe('canEditRow - root', () => {
  it('root coi như admin: sửa được mọi dòng; root bị khóa thì không', () => {
    const root = { id: 'r1', role: 'root', is_active: true } satisfies Pick<Profile, 'id' | 'role' | 'is_active'>
    expect(canEditRow(root, 'u1', at(1000), now)).toBe(true)
    expect(canEditRow({ ...root, is_active: false }, 'r1', at(1), now)).toBe(false)
  })
})

describe('userActions (D-014)', () => {
  const R = { id: 'r', role: 'root' } as const
  const A = { id: 'a', role: 'admin' } as const
  const A2 = { id: 'a2', role: 'admin' } as const
  const U = { id: 'u', role: 'user' } as const
  const all = { edit: true, resetPassword: true, toggleActive: true, changeRole: true }
  const none = { edit: false, resetPassword: false, toggleActive: false, changeRole: false }
  it.each([
    ['root → user', R, U, all],
    ['root → admin', R, A, all],
    ['root → chính mình: không khóa, không đổi vai trò', R, R, { ...all, toggleActive: false, changeRole: false }],
    ['admin → user: không đổi vai trò', A, U, { ...all, changeRole: false }],
    ['admin → chính mình: sửa tên + đặt lại mật khẩu, không khóa', A, A, { ...all, toggleActive: false, changeRole: false }],
    ['admin → admin khác', A, A2, none],
    ['admin → root', A, R, none],
    ['user → bất kỳ', U, A, none],
  ])('%s', (_n, me, target, expected) => {
    expect(userActions(me, target)).toEqual(expected)
  })
  it('chưa có hồ sơ → không được gì', () => {
    expect(userActions(null, U)).toEqual(none)
  })
})

describe('toLoginEmail', () => {
  it('không có @ → gắn email nội bộ, chữ thường, trim; có @ → giữ nguyên', () => {
    expect(toLoginEmail(' Bao.LT ')).toBe('bao.lt@kho-an-ha.local')
    expect(toLoginEmail('a@b.vn')).toBe('a@b.vn')
  })
})
