/** "2026-10-29" (date) hoặc ISO timestamp -> "29/10/2026". Không đổi múi giờ với chuỗi date thuần. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value
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
  return `Có lỗi xảy ra: ${err.message ?? 'không rõ nguyên nhân'}`
}
