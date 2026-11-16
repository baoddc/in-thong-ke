// Hàm thuần của sheets-sync (không I/O, không phụ thuộc Deno) để test được bằng vitest: quyết định dòng nào trong Sheet cần sửa / thêm / xóa.
export type Cell = string | number | null
export type Row = Cell[] // phần tử đầu = id của dòng trong database

/** Cột A của tab (kể cả dòng tiêu đề ở hàng 1) → bản đồ id → số hàng trong Sheet (hàng 1 = tiêu đề). Id trùng: giữ hàng đầu. */
export function idMap(colA: unknown[][] | undefined): Map<number, number> {
  const m = new Map<number, number>()
  ;(colA ?? []).forEach((cell, i) => {
    const n = Number(cell?.[0])
    if (i > 0 && Number.isInteger(n) && n > 0 && !m.has(n)) m.set(n, i + 1)
  })
  return m
}

/**
 * rowOf: id → hàng hiện có trong Sheet. payload: các dòng mới nhất từ database của những id cần "upsert".
 * upsert/del: id cần cập nhật / đã bị xóa. Id cần upsert mà database không còn (xóa chen giữa) cũng bị xóa khỏi Sheet.
 * deleteRows xếp giảm dần: xóa từ dưới lên thì số hàng của các dòng còn lại không bị lệch.
 */
export function planChanges(rowOf: Map<number, number>, payload: Row[], upsert: number[], del: number[]) {
  const present = new Set(payload.map((r) => Number(r[0])))
  const updates: { row: number; values: Row }[] = []
  const appends: Row[] = []
  for (const r of payload) {
    const at = rowOf.get(Number(r[0]))
    if (at) updates.push({ row: at, values: r })
    else appends.push(r)
  }
  const gone = new Set([...del.filter((id) => !present.has(id)), ...upsert.filter((id) => !present.has(id))])
  const deleteRows = [...gone].map((id) => rowOf.get(id)).filter((n): n is number => !!n).sort((a, b) => b - a)
  return { updates, appends, deleteRows }
}

/** Ô chữ bắt đầu bằng = + - @ bị Sheets hiểu là công thức (USER_ENTERED) → thêm dấu ' để thành chữ thường (chặn chèn công thức từ ghi chú). */
export const safe = (c: Cell): Cell => (typeof c === 'string' && /^[=+\-@]/.test(c) ? `'${c}` : c)
