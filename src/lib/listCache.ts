// Cache kết quả danh sách trong bộ nhớ (D-017): khóa = bảng + toàn bộ tham số lọc/sắp/trang. Hết hạn 60 s, giữ tối đa 30 mục.
import type { ListParams } from './listQuery'

const TTL_MS = 60_000
const MAX_ENTRIES = 30
export const FRESH_MS = 5_000 // mục mới hơn mức này (vd vừa prefetch) thì dùng luôn, không làm mới ngầm

export type CachedPage = { rows: unknown[]; total: number | null }
type Entry = { at: number; value: CachedPage }

const store = new Map<string, Entry>() // Map giữ thứ tự thêm → mục đầu tiên là cũ nhất
let generation = 0 // tăng khi xóa cache: request bắt đầu trước đó không được ghi đè dữ liệu cũ vào cache

export const cacheKey = (table: string, p: ListParams) => `${table}|${JSON.stringify(p)}`
export const cacheGeneration = () => generation

export function cacheGet(key: string): Entry | undefined {
  const e = store.get(key)
  if (e && Date.now() - e.at > TTL_MS) { store.delete(key); return undefined }
  return e
}

/** `startedAt` = cacheGeneration() lúc bắt đầu request; cache đã bị xóa từ đó thì bỏ qua kết quả. */
export function cacheSet(key: string, value: CachedPage, startedAt: number) {
  if (startedAt !== generation) return
  store.delete(key)
  store.set(key, { at: Date.now(), value })
  if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string)
}

/** Gọi sau khi lưu/sửa/xóa. Xóa cả hai bảng: sửa phiếu đổi luôn dữ liệu trong view bảng kiểm. */
export function clearListCache() {
  store.clear()
  generation++
}
