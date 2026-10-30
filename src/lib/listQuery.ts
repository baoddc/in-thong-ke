// Dựng truy vấn danh sách phân trang/lọc/sắp xếp phía server và đọc/ghi bộ lọc trong URL. Toàn bộ là hàm thuần.

export const PAGE_SIZES = [25, 50, 100] as const
export const DEFAULT_SIZE = 50
export type SortDir = 'asc' | 'desc'

export type ListParams = {
  page: number; size: number; q: string; from: string; to: string
  sort: string; dir: SortDir
  filters: Record<string, string> // khóa URL -> id (chuỗi số)
}

export type ListConfig = {
  sorts: readonly string[] // cột được phép sắp xếp
  defaultSort: string
  defaultDir: SortDir
  descFirst?: readonly string[] // cột bấm lần đầu thì giảm dần (ngày, số lượng…)
  filterCols: Record<string, string> // khóa URL -> id (chỉ khóa được dùng; lọc thật nằm trong tham số RPC)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const positive = (v: string | null, d: number) => {
  const n = Number.parseInt(v ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : d
}

export function parseListParams(sp: URLSearchParams, cfg: ListConfig): ListParams {
  const sortOk = cfg.sorts.includes(sp.get('sort') ?? '')
  const filters: Record<string, string> = {}
  for (const k of Object.keys(cfg.filterCols)) {
    const v = sp.get(k) ?? ''
    filters[k] = /^\d+$/.test(v) ? v : ''
  }
  const size = positive(sp.get('size'), DEFAULT_SIZE)
  const from = sp.get('from') ?? ''
  const to = sp.get('to') ?? ''
  return {
    page: positive(sp.get('page'), 1),
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_SIZE,
    q: (sp.get('q') ?? '').trim(),
    from: ISO_DATE.test(from) ? from : '',
    to: ISO_DATE.test(to) ? to : '',
    sort: sortOk ? sp.get('sort')! : cfg.defaultSort,
    dir: sortOk ? (sp.get('dir') === 'asc' ? 'asc' : 'desc') : cfg.defaultDir,
    filters,
  }
}

/** Ghi lại vào URL; giá trị mặc định thì bỏ đi cho URL gọn. */
export function toSearchParams(p: ListParams, cfg: ListConfig): URLSearchParams {
  const sp = new URLSearchParams()
  if (p.q) sp.set('q', p.q)
  if (p.from) sp.set('from', p.from)
  if (p.to) sp.set('to', p.to)
  for (const [k, v] of Object.entries(p.filters)) if (v) sp.set(k, v)
  if (p.sort !== cfg.defaultSort || p.dir !== cfg.defaultDir) { sp.set('sort', p.sort); sp.set('dir', p.dir) }
  if (p.size !== DEFAULT_SIZE) sp.set('size', String(p.size))
  if (p.page > 1) sp.set('page', String(p.page))
  return sp
}

/** Có bộ lọc nào đang bật không (không tính sắp xếp, phân trang). */
export const countActiveFilters = (p: ListParams) => [p.q, p.from, p.to, ...Object.values(p.filters)].filter(Boolean).length
export const hasActiveFilters = (p: ListParams) => countActiveFilters(p) > 0

/** Bấm tiêu đề cột: cột đang sắp → đảo chiều; cột khác → chiều đầu tiên của cột đó. */
export function nextSort(p: Pick<ListParams, 'sort' | 'dir'>, col: string, cfg: Pick<ListConfig, 'descFirst'>): { sort: string; dir: SortDir } {
  if (p.sort === col) return { sort: col, dir: p.dir === 'asc' ? 'desc' : 'asc' }
  return { sort: col, dir: cfg.descFirst?.includes(col) ? 'desc' : 'asc' }
}

/** Bỏ ký tự có nghĩa trong cú pháp `or(...)` của PostgREST và ký tự đại diện của ilike. */
export const sanitizeTerm = (s: string) => s.replace(/[,()"\\%*]/g, ' ').replace(/\s+/g, ' ').trim()

export const pageCount = (total: number, size: number) => Math.max(1, Math.ceil(total / size))
export const pageRange = (page: number, size: number): [number, number] => [(page - 1) * size, page * size - 1]

/** [đầu tháng, đầu tháng sau) của ngày `today` (yyyy-mm-dd). */
export function monthRange(today: string): [string, string] {
  const [y, m] = today.split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  return [`${y}-${pad(m)}-01`, m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`]
}
