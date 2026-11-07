import { Fragment, useSyncExternalStore, type ReactNode } from 'react'
import type { SortDir } from '../../lib/listQuery'
import { useColumnWidths } from '../../lib/useColumnWidths'
import Button from './Button'
import Icon from './Icon'

export type Column<T> = {
  key: string
  header: string
  sort?: string // tên cột server; có thì tiêu đề bấm để sắp xếp
  numeric?: boolean // căn phải + chữ số đều nhau
  nowrap?: boolean
  w?: string // lớp Tailwind độ rộng tối thiểu của cột, vd 'min-w-[14rem]': cột chữ dài không bị bóp hẹp
  clamp?: boolean // chữ dài cắt ở 2 dòng (rê chuột xem đủ) để các dòng cao đều nhau
  render: (row: T) => ReactNode
  // Chế độ thẻ (< md): title = dòng đầu (khóa), actions = nút thao tác bên phải, field = ô nhãn: giá trị, hide = không hiện. Mặc định field.
  mobile?: 'title' | 'actions' | 'field' | 'hide'
}

const MQ = '(max-width: 767px)'
const subscribe = (cb: () => void) => {
  const m = typeof window.matchMedia === 'function' ? window.matchMedia(MQ) : null
  m?.addEventListener?.('change', cb)
  return () => m?.removeEventListener?.('change', cb)
}
const snapshot = () => typeof window.matchMedia === 'function' && window.matchMedia(MQ).matches
/** Dưới md (điện thoại): bảng chuyển sang dạng thẻ. */
export const useIsBelowMd = () => useSyncExternalStore(subscribe, snapshot, () => false)

type Props<T> = {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  rowTestId?: (row: T) => string
  loading: boolean // chưa có dữ liệu lần nào → skeleton
  refreshing?: boolean // đang tải trang mới, giữ dòng cũ
  error: string
  onRetry: () => void
  sort: string
  dir: SortDir
  onSort: (col: string) => void
  empty: ReactNode
  testId: string
  attached?: boolean // có dải phân trang dính ngay dưới → bỏ bo góc/viền đáy
  topRow?: ReactNode // dòng nhập (<tr>) chèn đầu tbody; có thì bảng không hiện trạng thái trống
  draftRows?: ReactNode // dòng nháp chỉ đọc của người khác (D-025), đặt trên topRow; không ảnh hưởng trạng thái trống
  editRow?: { key: string | number; node: ReactNode } // D-030: dòng đang sửa tại chỗ (kiểu Google Sheets) — thay dòng có rowKey = key bằng node (<tr>)
}

const SKELETON_ROWS = 8
const WIDTHS = ['w-16', 'w-24', 'w-20', 'w-32', 'w-12']

// Cột đầu dính trái, tiêu đề dính trên (cuộn trong khung, không cuộn cả trang). Bốn trạng thái: tải / lỗi / trống / có dữ liệu.
export default function DataTable<T>({ columns, rows, rowKey, rowTestId, loading, refreshing, error, onRetry, sort, dir, onSort, empty, testId, attached, topRow, draftRows, editRow }: Props<T>) {
  const below = useIsBelowMd()
  const { widths, set: setWidth } = useColumnWidths(testId)
  if (error) {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-card border border-danger-line bg-danger-soft p-4 text-danger" data-testid="page-error">
        <Icon name="alert" className="mt-0.5" />
        <div>
          <p>{error}</p>
          <Button className="mt-2" onClick={onRetry} data-testid="page-retry">Thử lại</Button>
        </div>
      </div>
    )
  }
  if (!loading && rows.length === 0 && (!topRow || below)) {
    return <div className="rounded-card border border-stone-200 bg-white p-6 text-center text-muted shadow-card sm:p-8" data-testid="table-empty">{empty}</div>
  }

  if (below) {
    const mode = (c: Column<T>) => c.mobile ?? 'field'
    const titles = columns.filter((c) => mode(c) === 'title')
    const actions = columns.filter((c) => mode(c) === 'actions')
    const fields = columns.filter((c) => mode(c) === 'field')
    return (
      <div className={`flex flex-col gap-2 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`} aria-busy={loading || refreshing}
        data-testid={loading ? 'table-skeleton' : testId}>
        {loading
          ? Array.from({ length: 5 }, (_, r) => <div key={r} className="h-28 animate-pulse rounded-card border border-stone-200 bg-stone-100" />)
          : rows.map((r) => (
            <article key={rowKey(r)} data-testid={rowTestId?.(r)} className="rounded-card border border-stone-200 bg-white p-3 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-0.5 font-semibold [&_button]:min-h-11 [&_button]:min-w-11">{titles.map((c) => <Fragment key={c.key}>{c.render(r)}</Fragment>)}</div>
                <div className="flex shrink-0 items-center gap-0.5">{actions.map((c) => <Fragment key={c.key}>{c.render(r)}</Fragment>)}</div>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                {fields.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-xs text-muted">{c.header}</dt>
                    <dd className="min-h-5 break-words font-medium text-gray-900">{c.render(r)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
      </div>
    )
  }

  const th = 'px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap bg-stone-100 sticky top-0 border-b border-stone-200'
  // Độ rộng do người dùng kéo: cố định cột đó (width = min = max), chữ thừa bị cắt/xuống dòng trong ô.
  const fixed = (key: string) => (widths[key] ? { width: widths[key], minWidth: widths[key], maxWidth: widths[key] } : undefined)
  // Kéo mép phải tiêu đề để đổi độ rộng; bấm đúp = về mặc định; phím ←/→ chỉnh 16px. Pointer capture giữ con trỏ khi rê ra ngoài mép.
  const startResize = (e: React.PointerEvent<HTMLElement>, key: string) => {
    const h = e.currentTarget
    const x0 = e.clientX
    const w0 = h.parentElement?.getBoundingClientRect().width ?? 0
    let w = w0
    e.preventDefault()
    h.setPointerCapture?.(e.pointerId)
    const move = (ev: PointerEvent) => { w = w0 + ev.clientX - x0; setWidth(key, w, false) }
    const up = () => {
      h.removeEventListener('pointermove', move)
      h.removeEventListener('pointerup', up)
      h.removeEventListener('pointercancel', up)
      setWidth(key, w, true)
    }
    h.addEventListener('pointermove', move)
    h.addEventListener('pointerup', up)
    h.addEventListener('pointercancel', up)
  }
  const nudge = (e: React.KeyboardEvent<HTMLElement>, key: string) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const w = widths[key] ?? e.currentTarget.parentElement?.getBoundingClientRect().width ?? 0
    setWidth(key, w + (e.key === 'ArrowRight' ? 16 : -16), true)
  }
  return (
    // Từ md: lấp đầy chỗ trống của trang (cha là flex-col), tự cuộn trong khung; điện thoại: giới hạn 70vh, trang cuộn bình thường.
    <div className={`max-h-[70vh] overflow-auto ${attached ? 'rounded-t-card border-b-0' : 'rounded-card'} md:max-h-none md:min-h-[15rem] md:flex-1 border border-stone-200 bg-white shadow-card transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}
      aria-busy={loading || refreshing} data-testid={loading ? 'table-skeleton' : undefined}>
      <table className="min-w-full text-sm tabular-nums" data-testid={loading ? undefined : testId}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c.key} scope="col" aria-sort={c.sort && c.sort === sort ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                style={fixed(c.key)} className={`${th} ${i === 0 ? 'left-0 z-20' : 'z-10'} ${c.numeric ? '!text-right' : ''} ${c.w ?? ''} ${widths[c.key] ? 'overflow-hidden text-ellipsis' : ''}`}>
                {c.sort ? (
                  <button type="button" onClick={() => onSort(c.sort!)} data-testid={`sort-${c.sort}`}
                    className="inline-flex min-h-8 items-center gap-1 rounded font-semibold uppercase tracking-wide transition-colors duration-150 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    {c.header}
                    <span aria-hidden="true" className={c.sort === sort ? 'text-primary' : 'text-gray-400'}>{c.sort === sort ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </button>
                ) : c.header}
                <span role="separator" aria-orientation="vertical" aria-label={`Kéo để đổi độ rộng cột ${c.header} (bấm đúp: về mặc định)`} aria-valuenow={widths[c.key]} tabIndex={0}
                  title="Kéo để đổi độ rộng cột · bấm đúp: về mặc định" data-testid={`resize-${c.key}`}
                  onPointerDown={(e) => startResize(e, c.key)} onDoubleClick={() => setWidth(c.key, null, true)} onKeyDown={(e) => nudge(e, c.key)}
                  className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none before:absolute before:right-0.5 before:top-1/4 before:h-1/2 before:w-px before:bg-stone-300 hover:bg-stone-200 focus-visible:bg-stone-200 focus-visible:outline-none" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {draftRows}
          {topRow}
          {loading
            ? Array.from({ length: SKELETON_ROWS }, (_, r) => (
              <tr key={r} className="border-t border-stone-100">
                {columns.map((c, i) => (
                  <td key={c.key} className={`px-2.5 py-2.5 ${i === 0 ? 'sticky left-0 bg-white' : ''}`}>
                    <div className={`h-4 animate-pulse rounded bg-stone-200 ${WIDTHS[(r + i) % WIDTHS.length]}`} />
                  </td>
                ))}
              </tr>
            ))
            : rows.map((r) => editRow && rowKey(r) === editRow.key ? <Fragment key={rowKey(r)}>{editRow.node}</Fragment> : (
              <tr key={rowKey(r)} data-testid={rowTestId?.(r)} className="border-t border-stone-100 bg-white transition-colors duration-150 even:bg-stone-50 hover:!bg-primary-soft">
                {columns.map((c, i) => {
                  const content = c.render(r)
                  return (
                    <td key={c.key} style={fixed(c.key)} className={`px-2.5 py-1.5 align-middle ${i === 0 ? 'sticky left-0 bg-inherit font-medium' : ''} ${c.numeric ? 'text-right' : ''} ${c.nowrap || c.numeric ? 'whitespace-nowrap' : ''} ${c.w ?? ''} ${widths[c.key] ? 'overflow-hidden text-ellipsis' : ''}`}>
                      {c.clamp ? <div className={`line-clamp-2 break-words ${widths[c.key] ? '' : 'max-w-[22rem]'}`} title={typeof content === 'string' ? content : undefined}>{content}</div> : content}
                    </td>
                  )
                })}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

