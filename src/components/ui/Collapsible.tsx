import type { ReactNode } from 'react'
import Icon from './Icon'

/**
 * Khối thu gọn có chuyển động nhẹ (tắt khi người dùng chọn giảm chuyển động). Khi đóng: cao 0, không chiếm chỗ,
 * không nhận tiêu điểm bàn phím (visibility chuyển ở cuối khi đóng, ở đầu khi mở). Nội dung vẫn nằm trong DOM → ref/trạng thái ô nhập giữ nguyên.
 */
export function Collapsible({ id, open, children, testId }: { id: string; open: boolean; children: ReactNode; testId?: string }) {
  return (
    <div id={id} data-testid={testId} data-state={open ? 'open' : 'closed'}
      className={`grid shrink-0 transition-[grid-template-rows,opacity,margin,visibility] duration-200 motion-reduce:transition-none ${open ? 'grid-rows-[1fr] opacity-100' : '!mt-0 invisible grid-rows-[0fr] opacity-0'}`}>
      <div className={`min-h-0 ${open ? '' : 'overflow-hidden'}`}>{children}</div>
    </div>
  )
}

type ToggleProps = {
  controls: string // id của Collapsible
  open: boolean
  onToggle: () => void
  openLabel: string // nhãn khi đang hiện (bấm để ẩn), vd "Ẩn bộ lọc"
  closedLabel: string // nhãn khi đang ẩn, vd "Hiện bộ lọc"
  badge?: number // khi ẩn: số mục đang bật
  badgeLabel?: string // nhãn kèm số khi ẩn, vd "Bộ lọc" → "Bộ lọc (2)"
  testId: string
}

/** Nút ẩn/hiện một khối. Trên điện thoại chỉ còn biểu tượng (+ số đếm), nhãn đầy đủ nằm ở aria-label/title. */
export function PanelToggle({ controls, open, onToggle, openLabel, closedLabel, badge = 0, badgeLabel = closedLabel, testId }: ToggleProps) {
  const showBadge = !open && badge > 0
  const label = open ? openLabel : showBadge ? `${closedLabel} (${badge} đang bật)` : closedLabel
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls} aria-label={label} title={label} data-testid={testId}
      className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-sm font-medium text-gray-900 transition duration-150 hover:border-gray-400 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:min-h-8">
      <Icon name="down" size={16} className={`transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      <span className="hidden sm:inline">{showBadge ? `${badgeLabel} (${badge})` : open ? openLabel : closedLabel}</span>
      {showBadge && <span className="rounded-full bg-primary px-1.5 text-xs font-bold text-white sm:hidden" data-testid={`${testId}-badge`}>{badge}</span>}
    </button>
  )
}
