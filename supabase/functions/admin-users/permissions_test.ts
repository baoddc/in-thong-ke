import { assertEquals } from 'jsr:@std/assert@1'
import { type Action, canManage, type Role } from './permissions.ts'

const ME = 'me'
const OTHER = 'other'
// [caller, target.role, targetIsSelf, action, newRole, được phép?]
const cases: [Role, Role, boolean, Action, Role | undefined, boolean][] = [
  // user không làm gì được
  ['user', 'user', true, 'view', undefined, false],
  ['user', 'user', false, 'reset_password', undefined, false],
  ['user', 'user', false, 'create', undefined, false],
  // view / rename / reset_password
  ['root', 'root', true, 'view', undefined, true],
  ['root', 'admin', false, 'rename', undefined, true],
  ['root', 'user', false, 'reset_password', undefined, true],
  ['root', 'root', true, 'reset_password', undefined, true],
  ['admin', 'user', false, 'view', undefined, true],
  ['admin', 'user', false, 'rename', undefined, true],
  ['admin', 'user', false, 'reset_password', undefined, true],
  ['admin', 'admin', true, 'rename', undefined, true],
  ['admin', 'admin', true, 'reset_password', undefined, true],
  ['admin', 'admin', true, 'view', undefined, true],
  ['admin', 'admin', false, 'view', undefined, false],
  ['admin', 'admin', false, 'rename', undefined, false],
  ['admin', 'admin', false, 'reset_password', undefined, false],
  ['admin', 'root', false, 'view', undefined, false],
  ['admin', 'root', false, 'rename', undefined, false],
  ['admin', 'root', false, 'reset_password', undefined, false],
  // set_active
  ['root', 'user', false, 'set_active', undefined, true],
  ['root', 'admin', false, 'set_active', undefined, true],
  ['root', 'root', true, 'set_active', undefined, false],
  ['admin', 'user', false, 'set_active', undefined, true],
  ['admin', 'admin', true, 'set_active', undefined, false],
  ['admin', 'admin', false, 'set_active', undefined, false],
  ['admin', 'root', false, 'set_active', undefined, false],
  // create (target.role = vai trò sẽ tạo)
  ['root', 'user', false, 'create', undefined, true],
  ['root', 'admin', false, 'create', undefined, true],
  ['root', 'root', false, 'create', undefined, false],
  ['admin', 'user', false, 'create', undefined, true],
  ['admin', 'admin', false, 'create', undefined, false],
  ['admin', 'root', false, 'create', undefined, false],
  // change_role
  ['root', 'user', false, 'change_role', 'admin', true],
  ['root', 'admin', false, 'change_role', 'user', true],
  ['root', 'user', false, 'change_role', 'root', false],
  ['root', 'root', true, 'change_role', 'admin', false],
  ['admin', 'user', false, 'change_role', 'admin', false],
  ['admin', 'admin', true, 'change_role', 'user', false],
]

Deno.test('canManage theo D-014', () => {
  for (const [caller, role, self, action, newRole, ok] of cases) {
    const got = canManage(caller, ME, { id: self ? ME : OTHER, role }, action, newRole)
    assertEquals(got === null, ok, `${caller} -> ${self ? 'self ' : ''}${role} : ${action}${newRole ? ' ' + newRole : ''} (${got})`)
  }
})

Deno.test('thông điệp lỗi chính', () => {
  assertEquals(canManage('admin', ME, { id: null, role: 'admin' }, 'create'), 'Chỉ root được tạo admin')
  assertEquals(canManage('admin', ME, { id: OTHER, role: 'admin' }, 'set_active'), 'Admin chỉ quản lý tài khoản người dùng')
})
