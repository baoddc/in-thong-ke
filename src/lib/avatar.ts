import { supabase } from './supabase'
import { errorMessage } from './format'

export const AVATAR_BUCKET = 'avatars'
export const AVATAR_SIZE = 256 // px, ảnh vuông
export const MAX_RAW_BYTES = 8 * 1024 * 1024 // ảnh gốc tối đa 8 MB (sau khi thu nhỏ chỉ còn vài chục KB)
const ACCEPT = /^image\/(jpeg|png|webp)$/
/** Mẫu đường dẫn hợp lệ — khớp ràng buộc profiles_avatar_path_chk của DB. */
export const AVATAR_PATH_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9]{10,16}\.(webp|jpg)$/

/** Địa chỉ công khai của ảnh (bucket công khai). Đường dẫn đổi mỗi lần đổi ảnh nên không bị kẹt ảnh cũ trong bộ nhớ đệm. */
export const avatarUrl = (path: string) => `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`

/** `<user_id>/<mili-giây>.<webp|jpg>` — khớp ràng buộc profiles_avatar_path_chk và policy Storage (thư mục đầu = user_id). */
export const avatarObjectPath = (userId: string, ext: 'webp' | 'jpg', now = Date.now()) => `${userId}/${now}.${ext}`

/** Hình vuông chính giữa của ảnh w×h: cắt phần thừa hai bên (ảnh ngang) hoặc trên/dưới (ảnh dọc). */
export function cropRect(w: number, h: number) {
  const side = Math.min(w, h)
  return { sx: Math.floor((w - side) / 2), sy: Math.floor((h - side) / 2), side }
}

/** Cắt vuông giữa ảnh, thu nhỏ AVATAR_SIZE, nén WebP (không hỗ trợ thì JPEG). Lỗi → Error có thông báo tiếng Việt. */
export async function processImage(file: File): Promise<Blob> {
  if (!ACCEPT.test(file.type)) throw new Error('Chỉ nhận ảnh JPG, PNG hoặc WebP.')
  if (file.size > MAX_RAW_BYTES) throw new Error('Ảnh quá lớn (tối đa 8 MB). Hãy chọn ảnh nhỏ hơn.')
  let bmp: ImageBitmap
  try { bmp = await createImageBitmap(file) } catch { throw new Error('Không đọc được ảnh này. Hãy chọn ảnh khác.') }
  const { sx, sy, side } = cropRect(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = AVATAR_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Trình duyệt không xử lý được ảnh.')
  ctx.fillStyle = '#fff' // ảnh PNG trong suốt: nền trắng
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
  bmp.close()
  const toBlob = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.85))
  const webp = await toBlob('image/webp')
  const blob = webp?.type === 'image/webp' ? webp : await toBlob('image/jpeg')
  if (!blob) throw new Error('Không xử lý được ảnh này. Hãy chọn ảnh khác.')
  return blob
}

// Lỗi Storage không có mã lỗi Postgres: nhận diện theo nội dung
const fail = (e: { code?: string; message?: string }) =>
  new Error(/row-level security|42501/i.test(`${e.code ?? ''} ${e.message ?? ''}`) ? 'Bạn không có quyền đổi ảnh này.' : errorMessage(e))

/** Tải ảnh đã xử lý lên Storage rồi gắn vào hồ sơ CỦA CHÍNH MÌNH (`userId` = id đang đăng nhập; DB từ chối người khác); thành công thì xóa ảnh cũ (lỗi xóa thì bỏ qua). */
export async function saveAvatar(userId: string, blob: Blob, oldPath: string | null): Promise<string> {
  const path = avatarObjectPath(userId, blob.type === 'image/webp' ? 'webp' : 'jpg')
  const up = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000' })
  if (up.error) throw fail(up.error)
  const { error } = await supabase.rpc('set_avatar', { p_path: path })
  if (error) {
    void supabase.storage.from(AVATAR_BUCKET).remove([path])
    throw fail(error)
  }
  if (oldPath) void supabase.storage.from(AVATAR_BUCKET).remove([oldPath])
  return path
}

/** Gỡ ảnh đại diện của chính mình: bỏ liên kết trong hồ sơ rồi xóa tệp. */
export async function removeAvatar(oldPath: string): Promise<void> {
  const { error } = await supabase.rpc('set_avatar', { p_path: null })
  if (error) throw fail(error)
  void supabase.storage.from(AVATAR_BUCKET).remove([oldPath])
}
