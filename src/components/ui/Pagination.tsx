import { useState } from 'react'
import { formatNumber } from '../../lib/format'
import { PAGE_SIZES, pageCount } from '../../lib/listQuery'
import Icon from './Icon'

// total = null: không đếm được (request đếm lỗi) → chỉ hiện "Trang x", nút Sau bật khi trang hiện tại đầy.
type Props = { page: number; size: number; total: number | null; rowCount: number; disabled?: boolean; onPage: (page: number) => void; onSize: (size: number) => void }

const iconBtn = 'flex h-7 w-7 items-center justify-center rounded border border-line bg-white text-gray-800 transition-colors duration-150 hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white'

/** Dải mảnh (cao 32px, xuống 2 dòng nhỏ khi hẹp) dính liền đáy bảng — bảng bên trên phải bật `attached`. Giữ đủ thông tin ở mọi cỡ màn hình. */
export default function Pagination({ page, size, total, rowCount, disabled, onPage, onSize }: Props) {
  const pages = total === null ? Infinity : pageCount(total, size)
  const full = rowCount >= size // trang đầy → có thể còn trang sau, kể cả khi số đếm lệch
  const cur = full ? page : Math.min(page, pages)
  const [draft, setDraft] = useState<string | null>(null) // số đang gõ; null = hiện trang hiện tại

  function commit() {
    const n = Math.min(pages, Math.max(1, Math.trunc(Number(draft)) || cur))
    setDraft(null)
    if (n !== cur) onPage(n)
  }

  return (
    <div className="-mt-3 flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-b-card border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs text-gray-800 print:hidden" data-testid="pagination">
      <p aria-live="polite" className="flex min-w-0 items-center gap-1 whitespace-nowrap" data-testid="page-info">
        <label className="flex items-center gap-1">
          Trang
          <input type="text" inputMode="numeric" value={draft ?? String(cur)} disabled={disabled} aria-label="Số trang" data-testid="page-input"
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))} onBlur={() => draft !== null && commit()}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setDraft(null) }}
            className="h-6 w-12 rounded border border-line bg-white px-1 text-center text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:bg-gray-100" />
        </label>
        {total !== null && <span data-testid="page-count">/{formatNumber(pages)}</span>}
        {total !== null && <span className="text-muted" data-testid="page-total" title="Tổng số dòng">· tổng {formatNumber(total)} dòng</span>}
      </p>
      <div className="flex items-center gap-1">
        <label className="flex items-center gap-1 text-muted">
          Dòng/trang
          <select value={size} onChange={(e) => onSize(Number(e.target.value))} aria-label="Số dòng mỗi trang" data-testid="page-size"
            className="h-7 rounded border border-line bg-white px-1 text-xs text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button type="button" className={iconBtn} onClick={() => onPage(cur - 1)} disabled={disabled || cur <= 1} aria-label="Trang trước" title="Trang trước" data-testid="page-prev"><Icon name="prev" size={16} /></button>
        <button type="button" className={iconBtn} onClick={() => onPage(cur + 1)} disabled={disabled || !(full || (total !== null && cur < pages))} aria-label="Trang sau" title="Trang sau" data-testid="page-next"><Icon name="next" size={16} /></button>
      </div>
    </div>
  )
}
