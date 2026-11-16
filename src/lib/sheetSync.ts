import { supabase } from './supabase'

/**
 * Đồng bộ phiếu / dòng bảng kiểm sang Google Sheet (Edge Function sheets-sync lấy hàng đợi ở database).
 * Gọi sau khi lưu, sửa hoặc xóa thành công, không chờ kết quả và không bao giờ làm hỏng thao tác chính: lỗi (hoặc chưa cấu hình Google)
 * chỉ ghi console; thay đổi chưa đẩy vẫn nằm trong hàng đợi và được đẩy bù ở lần gọi sau.
 */
export function pushToSheet(): void {
  try {
    void Promise.resolve(supabase.functions.invoke('sheets-sync', { body: {} })).then(
      (res) => { if (res?.error) console.warn('Chưa đồng bộ được sang Google Sheet:', res.error.message) },
      (e) => console.warn('Chưa đồng bộ được sang Google Sheet:', e),
    )
  } catch (e) {
    console.warn('Chưa đồng bộ được sang Google Sheet:', e)
  }
}

type FullSyncReply = { configured?: boolean; busy?: boolean; done?: boolean; next_after?: number; written?: number; error?: string }

/** Lỗi 4xx/5xx của Edge Function: lấy câu giải thích trong phần thân thay vì câu chung chung của thư viện. */
async function replyOf(res: { data: unknown; error: unknown }): Promise<FullSyncReply> {
  const err = res.error as { context?: Response; message?: string } | null
  if (!err) return (res.data ?? {}) as FullSyncReply
  const body = await err.context?.json?.().catch(() => null)
  throw new Error((body as FullSyncReply | null)?.error ?? err.message ?? 'Không gọi được máy chủ')
}

/** Đồng bộ lại toàn bộ 2 bảng lên Sheet (xóa tab rồi ghi lại), chạy từng lượt cho tới khi xong. Trả tổng số dòng đã ghi. */
export async function fullSyncSheet(onProgress?: (written: number) => void): Promise<number> {
  let total = 0
  for (const tbl of ['transport_plans', 'inspection_details']) {
    let after: number | null = null
    for (;;) {
      const r: FullSyncReply = await replyOf(await supabase.functions.invoke('sheets-sync', { body: { action: 'full_sync', tbl, after } }))
      if (r.configured === false) throw new Error('Chưa cấu hình Google Sheet (thiếu khóa tài khoản dịch vụ hoặc mã file).')
      if (r.busy) throw new Error('Đang có một lần đồng bộ khác chạy. Thử lại sau ít phút.')
      total += r.written ?? 0
      onProgress?.(total)
      if (r.done) break
      after = r.next_after ?? null
    }
  }
  return total
}
