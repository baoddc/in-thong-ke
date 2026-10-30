/**
 * Gõ ngày kiểu Việt Nam: tự chèn "/" → "12102026" thành "12/10/2026".
 * Gõ sẵn dấu phân cách thì bù số 0: "1/2/2026" → "01/02/2026". Dán ISO "2026-10-12" → "12/10/2026".
 */
export function maskDateInput(raw: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  const parts = raw.replace(/^\D+/, '').split(/\D+/)
  if (!parts.slice(0, -1).some((p) => p.length === 1)) { // không có phần ngày/tháng 1 chữ số đứng trước dấu → ghép lại rồi chia 2-2-4
    const d = parts.join('').slice(0, 8)
    return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/')
  }
  return parts
    .slice(0, 3)
    .map((p, i) => (i < 2 ? (i < parts.length - 1 ? p.slice(0, 2).padStart(2, '0') : p.slice(0, 2)) : p.slice(0, 4)))
    .join('/')
}

/** "dd/mm/yyyy" → "yyyy-mm-dd"; rỗng → ""; sai định dạng hoặc ngày không có thật (31/02) → null. Năm 1900–2100. */
export function parseDisplayDate(text: string): string | null {
  const t = text.trim()
  if (!t) return ''
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (!m) return null
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (y < 1900 || y > 2100) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
