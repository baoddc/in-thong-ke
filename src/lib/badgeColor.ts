// 8 tông dịu (nền 50, chữ 800 → đủ tương phản AA). Viết nguyên chuỗi class để Tailwind quét được.
export const BADGE_TONES = [
  'bg-rose-50 text-rose-800 ring-rose-200',
  'bg-sky-50 text-sky-800 ring-sky-200',
  'bg-amber-50 text-amber-900 ring-amber-200',
  'bg-emerald-50 text-emerald-800 ring-emerald-200',
  'bg-violet-50 text-violet-800 ring-violet-200',
  'bg-teal-50 text-teal-800 ring-teal-200',
  'bg-orange-50 text-orange-900 ring-orange-200',
  'bg-indigo-50 text-indigo-800 ring-indigo-200',
] as const

/** Băm chuỗi (djb2) → số nguyên không âm. */
export function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h
}

/** Màu ổn định theo tên (không phân biệt hoa/thường, bỏ khoảng trắng thừa): cùng tên → cùng màu. */
export function badgeTone(name: string): string {
  return BADGE_TONES[hashString(name.trim().toLocaleLowerCase('vi')) % BADGE_TONES.length]
}

/** "Trần Văn Bình" → "TB" (chữ đầu của họ và tên); một từ → 1 chữ. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const first = words[0][0]
  return (words.length === 1 ? first : first + words[words.length - 1][0]).toLocaleUpperCase('vi')
}
