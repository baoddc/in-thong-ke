import { formatNumber } from '../../lib/format'
import { PAGE_SIZES, pageCount } from '../../lib/listQuery'
import Button from './Button'
import Icon from './Icon'
import { Select } from './Input'

// Danh sách đếm bằng count 'estimated': PostgREST trả số chính xác khi ít, ước lượng khi nhiều (> db-max-rows = 1000).
const ESTIMATE_ABOVE = 1000

type Props ={ page: number; size: number; total: number; disabled?: boolean; onPage: (page: number) => void; onSize: (size: number) => void }

export default function Pagination({ page, size, total, disabled, onPage, onSize }: Props) {
  const pages = pageCount(total, size)
  const cur = Math.min(page, pages)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-stone-200 bg-white px-3 py-2 text-sm shadow-card print:hidden" data-testid="pagination">
      <p aria-live="polite" data-testid="page-info">Trang {formatNumber(cur)}/{formatNumber(pages)} · {total > ESTIMATE_ABOVE ? 'khoảng' : 'tổng'} {formatNumber(total)} dòng</p>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-muted">
          Dòng/trang
          <Select value={size} onChange={(e) => onSize(Number(e.target.value))} className="!mt-0 !w-auto" data-testid="page-size">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </label>
        <Button icon="prev" onClick={() => onPage(cur - 1)} disabled={disabled || cur <= 1} aria-label="Trang trước" title="Trang trước" data-testid="page-prev">Trước</Button>
        <Button onClick={() => onPage(cur + 1)} disabled={disabled || cur >= pages} aria-label="Trang sau" title="Trang sau" data-testid="page-next">Sau<Icon name="next" size={18} /></Button>
      </div>
    </div>
  )
}
