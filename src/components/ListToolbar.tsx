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
  from: string // ISO yyyy-mm-dd
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
  active: boolean // có bộ lọc nào đang bật
  onClear: () => void
  children?: ReactNode // bộ lọc thêm (select…)
}

// Thanh lọc phía server: ô tìm nhanh (phím /), khoảng ngày xuất (dd/mm/yyyy), bộ lọc thêm.
export default function ListToolbar({ searchRef, text, onText, placeholder, from, to, onFrom, onTo, active, onClear, children }: Props) {
  return (
    <div className="grid grid-cols-2 items-end gap-3 rounded-card border border-stone-200 bg-white p-3 shadow-card sm:flex sm:flex-wrap" data-testid="list-toolbar">
      <Field label="Tìm nhanh" className="col-span-2 sm:w-72">
        <span className="relative block">
          <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input ref={searchRef} type="search" value={text} onChange={(e) => onText(e.target.value)} placeholder={placeholder}
            title="Phím tắt: /" autoComplete="off" className="pl-9" data-testid="search" />
        </span>
      </Field>
      <Field label="Từ ngày" className="sm:w-44">
        <DateInput value={from} max={to || undefined} onChange={onFrom} data-testid="filter-from" />
      </Field>
      <Field label="Đến ngày" className="sm:w-44">
        <DateInput value={to} min={from || undefined} onChange={onTo} data-testid="filter-to" />
      </Field>
      {children}
      {active && <Button onClick={onClear} className="col-span-2 sm:col-span-1" data-testid="clear-filters">Xóa bộ lọc</Button>}
    </div>
  )
}
