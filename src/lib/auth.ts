import type { Database } from '../types/database'

/** Email nội bộ của tài khoản tạo trong ứng dụng: `<tên đăng nhập>@kho-an-ha.local` (D-013). */
export const INTERNAL_EMAIL_DOMAIN = 'kho-an-ha.local'

/** D-014: 'root' (duy nhất 1) > 'admin' > 'user'. Khai báo đủ 3 vai trò ở đây để không phụ thuộc thứ tự cập nhật database.ts. */
export type Role = 'root' | 'admin' | 'user'
export type Profile = Omit<Database['public']['Tables']['profiles']['Row'], 'role'> & { role: Role }

export const ROLE_LABEL: Record<Role, string> = { root: 'Root', admin: 'Admin', user: 'Người dùng' }

/** Quyền dữ liệu của admin = root (D-014). */
export const isAdminRole = (role: Role | null | undefined): boolean => role === 'admin' || role === 'root'

export type UserActions = { edit: boolean; resetPassword: boolean; toggleActive: boolean; changeRole: boolean }

/**
 * Thao tác `me` được làm trên tài khoản `target` ở trang Quản lý người dùng (D-014), khớp Edge Function admin-users.
 * Chỉ để ẩn/khóa nút — quyền thật do Edge Function quyết định (trả 403).
 */
export function userActions(me: Pick<Profile, 'id' | 'role'> | null | undefined, target: Pick<Profile, 'id' | 'role'>): UserActions {
  const none = { edit: false, resetPassword: false, toggleActive: false, changeRole: false }
  if (!me) return none
  const self = me.id === target.id
  if (me.role === 'root') {
    const isRootTarget = target.role === 'root'
    return { edit: true, resetPassword: true, toggleActive: !isRootTarget && !self, changeRole: !isRootTarget && !self }
  }
  if (me.role === 'admin' && (self || target.role === 'user')) return { edit: true, resetPassword: true, toggleActive: !self, changeRole: false }
  return none
}

export const EDIT_WINDOW_HOURS = 24
export const EDIT_DENIED_HINT = 'Chỉ người tạo trong 24 giờ hoặc admin được sửa'
export const NO_PERMISSION_MSG = `Bạn không có quyền thực hiện thao tác này. ${EDIT_DENIED_HINT}.`

export const MIN_PASSWORD = 6 // mức thấp nhất của Supabase Auth
export const MAX_PASSWORD = 72

/** Mật khẩu ngẫu nhiên dễ đọc (bỏ ký tự dễ nhầm 0/O, 1/l/I). */
export function randomPassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const buf = crypto.getRandomValues(new Uint32Array(length))
  return Array.from(buf, (n) => chars[n % chars.length]).join('')
}

/** Ô đăng nhập: không có '@' thì coi là tên đăng nhập và gắn email nội bộ (chữ thường, bỏ khoảng trắng đầu/cuối). */
export function toLoginEmail(input: string): string {
  const t = input.trim()
  return t.includes('@') ? t : `${t.toLowerCase()}@${INTERNAL_EMAIL_DOMAIN}`
}

/**
 * Được sửa/xóa phiếu hoặc dòng bảng kiểm không (D-013): admin luôn được; người tạo chỉ trong vòng
 * dưới 24 giờ kể từ lúc tạo (đúng 24 giờ là hết hạn). Chỉ để ẩn/khóa nút — quyền thật do RLS quyết định.
 */
export function canEditRow(
  profile: Pick<Profile, 'id' | 'role' | 'is_active'> | null | undefined,
  createdBy: string | null | undefined,
  createdAt: string | null | undefined,
  now: number | Date = Date.now(),
): boolean {
  if (!profile?.is_active) return false
  if (isAdminRole(profile.role)) return true
  if (!createdBy || !createdAt || createdBy !== profile.id) return false
  const age = Number(now) - Date.parse(createdAt)
  return age < EDIT_WINDOW_HOURS * 3_600_000
}
