import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { errorMessage } from './format'
import { nextSort, pageCount, parseListParams, toSearchParams, type ListConfig, type ListParams } from './listQuery'

type Fetched = PromiseLike<{ data: unknown; count: number | null; error: { code?: string; message?: string } | null }>
export type Fetcher = (p: ListParams) => Fetched

/** Trạng thái danh sách phân trang: bộ lọc/trang nằm trong URL, dữ liệu tải từ server theo từng trang. */
export function useListPage<T>(cfg: ListConfig, fetcher: Fetcher) {
  const [sp, setSp] = useSearchParams()
  const p = useMemo(() => parseListParams(sp, cfg), [sp, cfg])
  const key = sp.toString()
  const [state, setState] = useState<{ key: string | null; rows: T[]; total: number; error: string }>({ key: null, rows: [], total: 0, error: '' })
  const req = useRef(0)

  /** Đổi bộ lọc/sắp xếp/cỡ trang thì về trang 1, trừ khi patch có `page`. */
  const update = useCallback((patch: Partial<ListParams>) => {
    setSp((prev) => {
      const cur = parseListParams(prev, cfg)
      return toSearchParams({ ...cur, ...patch, page: patch.page ?? 1 }, cfg)
    }, { replace: 'q' in patch })
  }, [setSp, cfg])

  const load = useCallback(async () => {
    const id = ++req.current
    const r = await fetcher(p)
    if (id !== req.current) return // đã có yêu cầu mới hơn
    if (r.error) setState((s) => ({ ...s, key, error: errorMessage(r.error) }))
    else {
      const rows = (r.data ?? []) as T[]
      setState({ key, rows, total: r.count ?? rows.length, error: '' })
    }
  }, [fetcher, p, key])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- tải dữ liệu, setState chạy sau await
  useEffect(() => { void load() }, [load])

  // Xóa hết dòng cuối của trang cuối → lùi về trang cuối còn dữ liệu.
  useEffect(() => {
    if (state.key === key && state.rows.length === 0 && state.total > 0 && p.page > 1) update({ page: pageCount(state.total, p.size) })
  }, [state, key, p.page, p.size, update])

  // Ô tìm nhanh: gõ tức thì, ghi vào URL sau 300ms.
  const [text, setText] = useState(p.q)
  const [seenQ, setSeenQ] = useState(p.q)
  if (p.q !== seenQ) { // URL đổi từ ngoài (nút Quay lại, Xóa bộ lọc) → đồng bộ ô gõ
    setSeenQ(p.q)
    if (p.q !== text.trim()) setText(p.q)
  }
  useEffect(() => {
    const t = setTimeout(() => { if (text.trim() !== p.q) update({ q: text.trim() }) }, 300)
    return () => clearTimeout(t)
  }, [text, p.q, update])

  return {
    p, update, text, setText, reload: load,
    rows: state.rows, total: state.total, error: state.error,
    loading: state.key === null, // chưa tải xong lần nào
    refreshing: state.key !== key && state.key !== null, // đang tải trang/bộ lọc mới, giữ dòng cũ mờ đi
    sortBy: (col: string) => update(nextSort(p, col, cfg)),
    clearFilters: () => update({ q: '', from: '', to: '', filters: Object.fromEntries(Object.keys(cfg.filterCols).map((k) => [k, ''])) }),
  }
}
