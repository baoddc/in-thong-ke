import { useEffect, useRef, type FormEvent } from 'react'
import { exporterOptions, type LookupItem } from '../lib/useLookups'
import { isBigKind } from '../lib/lookupSearch'
import { formatCountdown, usePlanForm } from '../lib/usePlanForm'
import { AuditNote } from './AuditInfo'
import LookupCombobox from './LookupCombobox'
import Button from './ui/Button'
import DateInput from './ui/DateInput'
import Icon from './ui/Icon'
import { inputClass, labelClass } from './ui/Input'
import { EDIT_DENIED_HINT } from '../lib/auth'
import type { PlanRow } from '../types/plan'

type Props = {
  plan: PlanRow | null // null: thêm mới
  readOnly?: boolean // không có quyền sửa (D-013): chỉ xem
  lookups: { byKind: (k: string) => LookupItem[]; loading: boolean; error: string; reload: () => Promise<void> }
  onClose: () => void
  onSaved: (message: string) => void
  onExpired?: (message: string) => void // hết giờ giữ số (chỉ khi thêm mới): trang đóng modal + báo
}

// Component chỉ được mount khi mở modal → đóng (unmount) là reset toàn bộ form.
export default function PlanFormModal({ plan, readOnly = false, lookups, onClose, onSaved, onExpired }: Props) {
  const { byKind, loading: lookupLoading, error: lookupError, reload } = lookups
  const dialogRef = useRef<HTMLDialogElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const { form, set, error, busy, dirty, hold, known, selectProps, submit, defaulted } = usePlanForm({ plan, readOnly, onSaved, onExpired, lookups })
  const { touch } = hold

  useEffect(() => {
    dialogRef.current?.showModal()
    dateRef.current?.focus()
  }, [])

  function requestClose() {
    if (busy) return
    if (dirty && !window.confirm('Bỏ các thay đổi chưa lưu?')) return
    onClose()
  }

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void submit() }

  // key đổi khi danh mục tải xong → ô gõ khởi tạo lại từ id trong form.
  const select = (label: string, kind: string, key: 'transportTypeId' | 'vehicleId' | 'driverId' | 'fgExporterId', id: string) => (
    <LookupCombobox key={`${id}-${lookupLoading}-${defaulted}`} label={label} kind={kind} items={exporterOptions(kind, byKind, [form[key]])} server={isBigKind(kind)} known={known[kind]}
      {...selectProps(key, id)} reload={reload} testId={id} />
  )

  return (
    <dialog ref={dialogRef} data-testid="plan-modal" aria-labelledby="plan-modal-title"
      onCancel={(e) => { e.preventDefault(); requestClose() }}
      // Ctrl+Enter = Lưu (bỏ qua nếu ô gợi ý đang chọn bằng Enter)
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.defaultPrevented) { e.preventDefault(); formRef.current?.requestSubmit() } }}
      className="p-0 w-full max-w-[640px] max-h-[90vh] overflow-hidden rounded-2xl border-t-4 border-primary-brand shadow-2xl backdrop:bg-slate-900/60 open:flex flex-col max-sm:max-w-none max-sm:max-h-none max-sm:w-screen max-sm:h-dvh max-sm:rounded-none">
      <form ref={formRef} onSubmit={onSubmit} onInput={touch} onClick={touch} className="flex flex-col min-h-0 flex-1" data-testid="plan-form">
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-4 py-3">
          <div className="min-w-0">
            <h2 id="plan-modal-title" className="text-lg font-bold">{plan ? `${readOnly ? 'Xem' : 'Sửa'} phiếu ${plan.tk_number}` : 'Thêm phiếu'}</h2>
            {plan && <AuditNote row={plan} />}
          </div>
          <button type="button" onClick={requestClose} aria-label="Đóng" className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 transition-colors duration-150 hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="plan-close"><Icon name="close" /></button>
        </div>
        {/* Vùng cuộn là <div>, không phải <fieldset>: fieldset có min-size riêng nên không co trong flex → đè lên chân modal. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-testid="modal-body">
        <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-3 border-0 p-0">
          {readOnly && <p className="rounded-card border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900" data-testid="readonly-note">{EDIT_DENIED_HINT}. Bạn chỉ xem được phiếu này.</p>}
          <label className={labelClass}>Số phiếu thống kê
            <input readOnly className={`${inputClass} bg-stone-100 font-semibold text-primary`} value={plan ? plan.tk_number : hold.number} data-testid="tk-number" />
            {!plan && !readOnly && hold.number && !hold.expired && (
              <span className="text-sm font-normal text-muted" data-testid="tk-hold-note">
                Số này được giữ cho bạn trong 5 phút · còn <span className="font-semibold tabular-nums" data-testid="tk-hold-timer">{formatCountdown(hold.remaining)}</span>
              </span>
            )}
          </label>
          <label className={labelClass}>Ngày xuất
            <DateInput ref={dateRef} required value={form.exportDate} onChange={(v) => set('exportDate', v)} data-testid="export-date" />
          </label>
          <label className={labelClass}>Số lệnh VC
            <input className={inputClass} value={form.orderNo} onChange={(e) => set('orderNo', e.target.value)} data-testid="order-no" />
          </label>
          {select('Phân loại VC', 'transport_type', 'transportTypeId', 'transport-type')}
          {select('Số xe lấy hàng', 'vehicle', 'vehicleId', 'vehicle')}
          {select('Tên tài xế/ phụ xe', 'driver', 'driverId', 'driver')}
          {select('NV Xuất TP/BTP', 'fg_exporter', 'fgExporterId', 'fg-exporter')}
          <LookupCombobox key={`mat-${lookupLoading}`} label="NV Xuất VT" kind="material_exporter" items={exporterOptions('material_exporter', byKind, form.materialIds)}
            selectedIds={form.materialIds} multiple onChange={(ids) => set('materialIds', ids)} reload={reload} testId="material-exporters" />
          <label className={labelClass}>Ghi chú
            <textarea rows={3} className={inputClass} value={form.note} onChange={(e) => set('note', e.target.value)} data-testid="note" />
          </label>
          {(error || lookupError || hold.error) && <p role="alert" className="rounded-card border border-danger-line bg-danger-soft p-2 text-danger" data-testid="plan-error">{error || lookupError || hold.error}</p>}
        </fieldset>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-stone-200 bg-surface px-4 py-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {!readOnly && <span className="mr-auto hidden text-sm text-muted sm:inline">Ctrl+Enter để lưu</span>}
          <Button onClick={requestClose} data-testid="plan-cancel">{readOnly ? 'Đóng' : 'Hủy'}</Button>
          {!readOnly && (
            <Button type="submit" variant="primary" disabled={busy} title="Lưu (Ctrl+Enter)" data-testid="plan-save">
              {busy ? 'Đang lưu...' : plan ? 'Cập nhật' : 'Lưu'}
            </Button>
          )}
        </div>
      </form>
    </dialog>
  )
}
