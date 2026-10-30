type Item = { id: number; name: string }

const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' })

/** So sánh theo tên, số theo giá trị ("2 - b" < "10 - a"); hòa thì theo id. Dùng chung cho mọi danh sách danh mục. */
export function compareNames(a: Item, b: Item): number {
  return collator.compare(a.name, b.name) || a.id - b.id
}

/** Chữ thường, bỏ dấu tiếng Việt (NFD), đ→d, bỏ khoảng trắng đầu/cuối. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim()
}

/** Tên (trim, không phân biệt hoa thường) → id; không khớp thì trả null. */
export function findIdByName(items: Item[], text: string): number | null {
  const t = text.trim().toLowerCase()
  return t ? (items.find((i) => i.name.trim().toLowerCase() === t)?.id ?? null) : null
}

/** Gợi ý: tên chứa chuỗi gõ (không phân biệt hoa thường/dấu), bỏ mục trong `excludeIds`, tối đa `limit` mục. Rỗng → []. */
export function filterSuggestions(items: Item[], query: string, limit = 20, excludeIds: number[] = []): Item[] {
  const q = normalize(query)
  if (!q) return []
  const out: Item[] = []
  for (const i of items) {
    if (out.length >= limit) break
    if (!excludeIds.includes(i.id) && normalize(i.name).includes(q)) out.push(i)
  }
  return out
}

/** Có mục trùng khít tên đã gõ (sau trim, không phân biệt hoa thường) → không cần mục "+ Thêm". */
export function hasExactMatch(items: Item[], text: string): boolean {
  return findIdByName(items, text) !== null
}
