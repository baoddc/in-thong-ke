// Kiểm quyền quản lý tài khoản (D-014). Hàm thuần, không I/O. Trả null nếu được phép, ngược lại thông điệp lỗi (HTTP 403).
export type Role = 'root' | 'admin' | 'user'
export type Action = 'view' | 'create' | 'rename' | 'change_role' | 'set_active' | 'reset_password'
// create: target.role = vai trò sẽ tạo (id bỏ qua). change_role: target.role = vai trò hiện tại, newRole = vai trò mới.
export type Target = { id: string | null; role: Role }

export const isRole = (v: unknown): v is Role => v === 'root' || v === 'admin' || v === 'user'

const ONLY_USER = 'Admin chỉ quản lý tài khoản người dùng'

export function canManage(callerRole: Role, callerId: string, target: Target, action: Action, newRole?: Role): string | null {
  if (callerRole !== 'root' && callerRole !== 'admin') return 'Chỉ quản trị viên mới được quản lý người dùng'
  const isRoot = callerRole === 'root'
  const self = target.id === callerId

  switch (action) {
    case 'create':
      if (target.role === 'root') return 'Không thể tạo tài khoản root'
      if (target.role === 'admin' && !isRoot) return 'Chỉ root được tạo admin'
      return null
    case 'change_role':
      if (!isRoot) return 'Chỉ root được đổi vai trò'
      if (target.role === 'root') return 'Không thể đổi vai trò của root'
      if (newRole !== 'admin' && newRole !== 'user') return 'Chỉ được đặt vai trò admin hoặc người dùng'
      return null
    case 'set_active':
      if (target.role === 'root') return 'Không thể khóa hoặc mở khóa tài khoản root'
      return isRoot || target.role === 'user' ? null : ONLY_USER
    case 'view':
    case 'rename':
    case 'reset_password':
      // root: mọi người (kể cả mình); admin: user hoặc chính mình
      return isRoot || self || target.role === 'user' ? null : ONLY_USER
  }
}
