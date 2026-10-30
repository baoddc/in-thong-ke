// BẢN SAO của ../admin-users/username.ts — giữ đồng bộ (mỗi function được deploy đóng gói riêng, không import chéo thư mục).
// Hàm thuần sinh tên đăng nhập (D-013). Không phụ thuộc Deno/Supabase để test được.

// Domain email nội bộ cho tài khoản tạo mới (không gửi mail). Đổi ở ĐÂY nếu GoTrue từ chối ".local";
// FE (ô đăng nhập tự gắn @domain khi không có "@") phải dùng cùng giá trị.
export const INTERNAL_EMAIL_DOMAIN = 'kho-an-ha.local'

const clean = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, '')

/** "Lê Thái Bão" -> "bao.lt"; "Bão" -> "bao"; không còn ký tự hợp lệ -> "". */
export function makeUsername(fullName: string): string {
  const words = fullName.split(/\s+/).map(clean).filter(Boolean)
  const last = words.pop()
  if (!last) return ''
  return words.length ? `${last}.${words.map((w) => w[0]).join('')}` : last
}

/** Trả base nếu chưa dùng, không thì base2, base3... (so sánh không phân biệt hoa thường). */
export function nextFreeUsername(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((t) => t.toLowerCase()))
  if (!used.has(base)) return base
  for (let n = 2; ; n++) if (!used.has(base + n)) return base + n
}
