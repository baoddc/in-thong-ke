/** "2026-10-29" (date) hoặc ISO timestamp -> "29/10/2026". Không đổi múi giờ với chuỗi date thuần. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value
}

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** ISO timestamp -> "30/10/2026 14:05" (giờ Việt Nam); rỗng/sai -> "". */
export function formatDateTime(value: string | null | undefined): string {
  const t = value ? Date.parse(value) : NaN
  if (Number.isNaN(t)) return ''
  const p = Object.fromEntries(dateTimeFmt.formatToParts(t).map((x) => [x.type, x.value]))
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`
}

/** ISO timestamp -> "30/10 14:05" (giờ VN, bỏ năm) cho ô bảng gọn. */
export function formatShortDateTime(value: string | null | undefined): string {
  const s = formatDateTime(value)
  return s && `${s.slice(0, 5)} ${s.slice(11)}`
}

export function todayISO(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
}

const numberFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 })

/** 1234.5 -> "1.234,5" (tối đa 3 chữ số thập phân); null -> "". */
export function formatNumber(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : numberFmt.format(n)
}

/**
 * Chuỗi số kiểu VN -> number: "5,5" -> 5.5; "1.234,5" -> 1234.5; "1.234" -> 1234.
 * Dấu phẩy là thập phân, dấu chấm CHỈ là phân cách hàng nghìn ("5.5", "1.23" -> NaN).
 * Rỗng -> null; sai định dạng hoặc số âm -> NaN.
 */
export function parseVnNumber(s: string): number | null {
  const t = s.replace(/\s/g, '')
  if (!t) return null
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'))
  if (/^\d+(,\d+)?$/.test(t)) return Number(t.replace(',', '.'))
  return NaN
}

/** Mã lỗi Postgres/Supabase -> thông báo tiếng Việt. */
export function errorMessage(err: { code?: string; message?: string } | null | undefined): string {
  if (!err) return ''
  if (err.code === '23505') return 'Mục này đã có.'
  if (err.code === '23503') return 'Mục đang được dùng trong phiếu, không xóa được.'
  if (err.code === 'P0002' && err.message) return err.message // RPC báo thiếu quyền: hiển thị nguyên văn
  if (err.code === '42501') return 'Bạn không có quyền thực hiện thao tác này.'
  return `Có lỗi xảy ra: ${err.message ?? 'không rõ nguyên nhân'}`
}
