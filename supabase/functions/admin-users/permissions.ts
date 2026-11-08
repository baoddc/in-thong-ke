// Kiểm quyền quản lý tài khoản (D-014). Hàm thuần, không I/O. Trả null nếu được phép, ngược lại thông điệp lỗi (HTTP 403).
export type Role = 'root' | 'admin' | 'user'
export type Action = 'view' | 'create' | 'rename' | 'change_role' | 'set_active' | 'reset_password' | 'approve' | 'reject'
// create: target.role = vai trò sẽ tạo (id bỏ qua). change_role: target.role = vai trò hiện tại, newRole = vai trò mới.
// pending: tài khoản tự đăng ký đang chờ duyệt (D-015).
export type Target = { id: string | null; role: Role; pending?: boolean }

export const isRole = (v: unknown): v is Role => v === 'root' || v === 'admin' || v === 'user'

const ONLY_USER = 'Admin chỉ quản lý tài khoản người dùng'
// Thông điệp trung tính: không nhắc tới tài khoản cấp cao nhất (giữ kín với mọi người dùng, kể cả khi gửi lệnh trực tiếp lên server)
const DENIED = 'Bạn không có quyền thực hiện thao tác này'

export function canManage(callerRole: Role, callerId: string, target: Target, action: Action, newRole?: Role): string | null {
  if (callerRole !== 'root' && callerRole !== 'admin') return 'Chỉ quản trị viên mới được quản lý người dùng'
  const isRoot = callerRole === 'root'
  const self = target.id === callerId

  switch (action) {
    case 'create':
      if (target.role === 'root') return DENIED
      if (target.role === 'admin' && !isRoot) return DENIED
      return null
    case 'change_role':
      if (!isRoot) return DENIED
      if (target.role === 'root') return DENIED
      if (newRole !== 'admin' && newRole !== 'user') return 'Chỉ được đặt vai trò admin hoặc người dùng'
      return null
    case 'approve':
    case 'reject':
      return target.pending && target.role === 'user' ? null : 'Chỉ duyệt hoặc từ chối được tài khoản đang chờ duyệt'
    case 'set_active':
      if (target.pending) return 'Tài khoản đang chờ duyệt: hãy dùng Duyệt hoặc Từ chối'
      if (target.role === 'root') return DENIED
      return isRoot || target.role === 'user' ? null : ONLY_USER
    case 'view':
      // root: mọi người; admin: user, admin khác và chính mình (admin thấy nhau, 08/11/2026) — không bao giờ thấy tài khoản cấp cao nhất
      return isRoot || self || target.role !== 'root' ? null : DENIED
    case 'rename':
    case 'reset_password':
      // root: mọi người (kể cả mình); admin: user hoặc chính mình (admin khác chỉ xem, không sửa)
      return isRoot || self || target.role === 'user' ? null : ONLY_USER
  }
}
