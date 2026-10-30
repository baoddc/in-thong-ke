import type { ReactNode } from 'react'
import type { SortDir } from '../../lib/listQuery'
import Button from './Button'
import Icon from './Icon'

export type Column<T> = {
  key: string
  header: string
  sort?: string // tên cột server; có thì tiêu đề bấm để sắp xếp
  numeric?: boolean // căn phải + chữ số đều nhau
  nowrap?: boolean
  render: (row: T) => ReactNode
}

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
}

const SKELETON_ROWS = 8
const WIDTHS = ['w-16', 'w-24', 'w-20', 'w-32', 'w-12']

// Cột đầu dính trái, tiêu đề dính trên (cuộn trong khung, không cuộn cả trang). Bốn trạng thái: tải / lỗi / trống / có dữ liệu.
export default function DataTable<T>({ columns, rows, rowKey, rowTestId, loading, refreshing, error, onRetry, sort, dir, onSort, empty, testId, attached }: Props<T>) {
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
  if (!loading && rows.length === 0) {
    return <div className="rounded-card border border-stone-200 bg-white p-6 text-center text-muted shadow-card sm:p-8" data-testid="table-empty">{empty}</div>
  }

  const th = 'px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap bg-stone-100 sticky top-0 border-b border-stone-200'
  return (
    // Từ md: lấp đầy chỗ trống của trang (cha là flex-col), tự cuộn trong khung; điện thoại: giới hạn 70vh, trang cuộn bình thường.
    <div className={`max-h-[70vh] overflow-auto ${attached ? 'rounded-t-card border-b-0' : 'rounded-card'} md:max-h-none md:min-h-[15rem] md:flex-1 border border-stone-200 bg-white shadow-card transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}
      aria-busy={loading || refreshing} data-testid={loading ? 'table-skeleton' : undefined}>
      <table className="min-w-full text-sm tabular-nums" data-testid={loading ? undefined : testId}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c.key} scope="col" aria-sort={c.sort && c.sort === sort ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                className={`${th} ${i === 0 ? 'left-0 z-20' : 'z-10'} ${c.numeric ? '!text-right' : ''}`}>
                {c.sort ? (
                  <button type="button" onClick={() => onSort(c.sort!)} data-testid={`sort-${c.sort}`}
                    className="inline-flex min-h-8 items-center gap-1 rounded font-semibold uppercase tracking-wide transition-colors duration-150 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    {c.header}
                    <span aria-hidden="true" className={c.sort === sort ? 'text-primary' : 'text-gray-400'}>{c.sort === sort ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </button>
                ) : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
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
            : rows.map((r) => (
              <tr key={rowKey(r)} data-testid={rowTestId?.(r)} className="border-t border-stone-100 bg-white transition-colors duration-150 even:bg-stone-50 hover:!bg-primary-soft">
                {columns.map((c, i) => (
                  <td key={c.key} className={`px-2.5 py-1.5 align-middle ${i === 0 ? 'sticky left-0 bg-inherit font-medium' : ''} ${c.numeric ? 'text-right' : ''} ${c.nowrap || c.numeric ? 'whitespace-nowrap' : ''}`}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

