import type { ReactNode, RefObject } from 'react'
import Button from './ui/Button'
import DateInput from './ui/DateInput'
import Icon from './ui/Icon'
import { Field, Input } from './ui/Input'

type Props = {
  searchRef: RefObject<HTMLInputElement>
  text: string
  onText: (v: string) => void
  placeholder: string
  searchTitle?: string // mô tả đầy đủ các cột được tìm (tooltip + aria-label)
  from: string // ISO yyyy-mm-dd
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
  active: boolean // có bộ lọc nào đang bật
  onClear: () => void
  children?: ReactNode // bộ lọc thêm (select…)
}

// Thanh lọc phía server: ô tìm nhanh (phím /), khoảng ngày xuất (dd/mm/yyyy), bộ lọc thêm. Nhãn nổi trên viền ô để thanh lọc thấp.
export default function ListToolbar({ searchRef, text, onText, placeholder, searchTitle, from, to, onFrom, onTo, active, onClear, children }: Props) {
  return (
    // pt-3: chừa chỗ cho nhãn nổi nằm trên viền ô
    <div className="grid grid-cols-2 items-start gap-x-2 gap-y-3 rounded-card border border-stone-200 bg-white p-2 pt-3 shadow-sm sm:flex sm:flex-wrap" data-testid="list-toolbar">
      <Field compact label="Tìm nhanh" className="col-span-2 sm:w-60">
        <span className="relative block">
          <Icon name="search" size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input inputSize="sm" ref={searchRef} type="search" value={text} onChange={(e) => onText(e.target.value)} placeholder={placeholder}
            title={searchTitle ? `${searchTitle}. Phím tắt: /` : 'Phím tắt: /'} aria-label={searchTitle ? `Tìm nhanh: ${searchTitle}` : undefined} autoComplete="off" className="pl-8" data-testid="search" />
        </span>
      </Field>
      <div className="col-span-2 flex items-start gap-1.5" role="group" aria-label="Khoảng ngày xuất">
        <Field compact label="Từ ngày" className="min-w-0 flex-1 sm:w-36 sm:flex-none">
          <DateInput inputSize="sm" value={from} max={to || undefined} onChange={onFrom} data-testid="filter-from" />
        </Field>
        <span aria-hidden="true" className="pt-1.5 text-gray-500">–</span>
        <Field compact label="Đến ngày" className="min-w-0 flex-1 sm:w-36 sm:flex-none">
          <DateInput inputSize="sm" value={to} min={from || undefined} onChange={onTo} data-testid="filter-to" />
        </Field>
      </div>
      {children}
      {active && <Button size="sm" onClick={onClear} className="col-span-2 sm:col-span-1 sm:min-h-9" data-testid="clear-filters">Xóa bộ lọc</Button>}
    </div>
  )
}
