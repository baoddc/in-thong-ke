import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { errorMessage } from './format'
import { FRESH_MS, cacheGeneration, cacheGet, cacheKey, cacheSet, clearListCache } from './listCache'
import { nextSort, pageCount, parseListParams, toSearchParams, type ListConfig, type ListParams } from './listQuery'

type Fetched = PromiseLike<{ data: unknown; count: number | null; error: { code?: string; message?: string } | null }>
export type Fetcher = (p: ListParams) => Fetched

/** Trạng thái danh sách phân trang: bộ lọc/trang nằm trong URL, dữ liệu tải từ server theo từng trang. `table` = một phần khóa cache. */
export function useListPage<T>(cfg: ListConfig, fetcher: Fetcher, table: string) {
  const [sp, setSp] = useSearchParams()
  const p = useMemo(() => parseListParams(sp, cfg), [sp, cfg])
  const key = sp.toString()
  // total = null khi không đếm được (request đếm lỗi): vẫn hiện dữ liệu, không chặn điều hướng.
  const [state, setState] = useState<{ key: string | null; rows: T[]; total: number | null; error: string }>({ key: null, rows: [], total: 0, error: '' })
  const req = useRef(0)

  /** Đổi bộ lọc/sắp xếp/cỡ trang thì về trang 1, trừ khi patch có `page`. */
  const update = useCallback((patch: Partial<ListParams>) => {
    setSp((prev) => {
      const cur = parseListParams(prev, cfg)
      return toSearchParams({ ...cur, ...patch, page: patch.page ?? 1 }, cfg)
    }, { replace: 'q' in patch })
  }, [setSp, cfg])

  /** Trang kế chưa có trong cache thì tải sẵn (lỗi bỏ qua: tới lúc bấm sẽ tải lại và báo lỗi). */
  const prefetch = useCallback((rows: unknown[], total: number | null) => {
    const hasNext = total === null ? rows.length === p.size : p.page < pageCount(total, p.size)
    const next = { ...p, page: p.page + 1 }
    const nextKey = cacheKey(table, next)
    if (!hasNext || cacheGet(nextKey)) return
    const gen = cacheGeneration()
    Promise.resolve(fetcher(next)).then((r) => { if (!r.error) cacheSet(nextKey, { rows: (r.data ?? []) as unknown[], total: r.count ?? null }, gen) }, () => {})
  }, [fetcher, p, table])

  // force: bỏ qua cache (sau khi lưu/xóa, nút Thử lại). Cache còn hạn → hiện ngay rồi làm mới ngầm (stale-while-revalidate).
  const load = useCallback(async (force = false) => {
    const id = ++req.current
    const ck = cacheKey(table, p)
    const hit = force ? undefined : cacheGet(ck)
    if (hit) {
      setState({ key, rows: hit.value.rows as T[], total: hit.value.total, error: '' })
      if (Date.now() - hit.at < FRESH_MS) return prefetch(hit.value.rows, hit.value.total)
    }
    const gen = cacheGeneration()
    const r = await fetcher(p)
    if (id !== req.current) return // đã có yêu cầu mới hơn
    if (r.error) {
      if (!hit) setState((s) => ({ ...s, key, error: errorMessage(r.error) })) // làm mới ngầm lỗi thì giữ dữ liệu đang hiện
      return
    }
    const rows = (r.data ?? []) as T[]
    const total = r.count ?? null
    cacheSet(ck, { rows, total }, gen)
    setState({ key, rows, total, error: '' })
    prefetch(rows, total)
  }, [fetcher, p, key, table, prefetch])

  const reload = useCallback(() => { clearListCache(); return load(true) }, [load])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- tải dữ liệu, hiện cache hoặc setState sau await
  useEffect(() => { void load() }, [load])

  // Xóa hết dòng cuối của trang cuối → lùi về trang cuối còn dữ liệu.
  useEffect(() => {
    if (state.key === key && state.rows.length === 0 && state.total !== null && state.total > 0 && p.page > 1) update({ page: pageCount(state.total, p.size) })
  }, [state, key, p.page, p.size, update])

  // Ô tìm nhanh: gõ tức thì, ghi vào URL sau 200ms.
  const [text, setText] = useState(p.q)
  const [seenQ, setSeenQ] = useState(p.q)
  if (p.q !== seenQ) { // URL đổi từ ngoài (nút Quay lại, Xóa bộ lọc) → đồng bộ ô gõ
    setSeenQ(p.q)
    if (p.q !== text.trim()) setText(p.q)
  }
  useEffect(() => {
    const t = setTimeout(() => { if (text.trim() !== p.q) update({ q: text.trim() }) }, 200)
    return () => clearTimeout(t)
  }, [text, p.q, update])

  return {
    p, update, text, setText, reload,
    rows: state.rows, total: state.total, error: state.error,
    hasData: state.rows.length > 0 || (state.total ?? 0) > 0,
    loading: state.key === null, // chưa tải xong lần nào
    refreshing: state.key !== key && state.key !== null, // đang tải trang/bộ lọc mới, giữ dòng cũ mờ đi
    sortBy: (col: string) => update(nextSort(p, col, cfg)),
    clearFilters: () => update({ q: '', from: '', to: '', filters: Object.fromEntries(Object.keys(cfg.filterCols).map((k) => [k, ''])) }),
  }
}
