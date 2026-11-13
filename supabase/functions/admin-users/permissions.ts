// Kiểm quyền quản lý tài khoản (D-014). Hàm thuần, không I/O. Trả null nếu được phép, ngược lại thông điệp lỗi (HTTP 403).
export type Role = 'root' | 'admin' | 'user' | 'viewer'
export type Action = 'view' | 'create' | 'rename' | 'change_role' | 'set_active' | 'reset_password' | 'approve' | 'reject'
// create: target.role = vai trò sẽ tạo (id bỏ qua). change_role: target.role = vai trò hiện tại, newRole = vai trò mới.
// pending: tài khoản tự đăng ký đang chờ duyệt (D-015).
export type Target = { id: string | null; role: Role; pending?: boolean }

export const isRole = (v: unknown): v is Role => v === 'root' || v === 'admin' || v === 'user' || v === 'viewer'

const ONLY_USER = 'Admin chỉ quản lý tài khoản người dùng'
const plain = (r: Role) => r === 'user' || r === 'viewer' // vai trò thường: admin được quản lý
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
      if (target.role === 'root' || self) return DENIED
      if (newRole !== 'admin' && newRole !== 'user' && newRole !== 'viewer') return 'Chỉ được đặt vai trò admin, người dùng hoặc chỉ xem'
      // admin chỉ đổi qua lại Người dùng ↔ Chỉ xem; nâng lên admin hoặc đổi vai trò admin khác là việc của cấp cao nhất
      if (!isRoot && !(plain(target.role) && plain(newRole))) return DENIED
      return null
    case 'approve':
    case 'reject':
      return target.pending && target.role === 'user' ? null : 'Chỉ duyệt hoặc từ chối được tài khoản đang chờ duyệt'
    case 'set_active':
      if (target.pending) return 'Tài khoản đang chờ duyệt: hãy dùng Duyệt hoặc Từ chối'
      if (target.role === 'root') return DENIED
      return isRoot || plain(target.role) ? null : ONLY_USER
    case 'view':
      // root: mọi người; admin: user, admin khác và chính mình (admin thấy nhau, 08/11/2026) — không bao giờ thấy tài khoản cấp cao nhất
      return isRoot || self || target.role !== 'root' ? null : DENIED
    case 'rename':
    case 'reset_password':
      // root: mọi người (kể cả mình); admin: user hoặc chính mình (admin khác chỉ xem, không sửa)
      return isRoot || self || plain(target.role) ? null : ONLY_USER
  }
}
