import { useEffect, useRef } from 'react'
import type { LookupItem } from '../lib/useLookups'
import { isBigKind } from '../lib/lookupSearch'
import { EDIT_DENIED_HINT } from '../lib/auth'
import { useInspectionForm, type InspectionIdKey } from '../lib/useInspectionForm'
import { AuditNote } from './AuditInfo'
import LookupCombobox from './LookupCombobox'
import Button from './ui/Button'
import DateInput from './ui/DateInput'
import Icon from './ui/Icon'
import { inputClass, labelClass } from './ui/Input'
import type { InspectionRow } from '../types/inspection'

type Props = {
  row: InspectionRow | null // null: thêm mới
  readOnly?: boolean // không có quyền sửa (D-013): chỉ xem
  lookups: { byKind: (k: string) => LookupItem[]; loading: boolean; error: string; reload: () => Promise<void> }
  onClose: () => void
  onSaved: (message: string, keepOpen: boolean) => void
}

// Component chỉ được mount khi mở modal → đóng (unmount) là reset toàn bộ form.
export default function InspectionFormModal({ row, readOnly = false, lookups, onClose, onSaved }: Props) {
  const { byKind, loading: lookupLoading, error: lookupError, reload } = lookups
  const dialogRef = useRef<HTMLDialogElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const f = useInspectionForm({ row, readOnly, lookups, validity: formRef, onSaved })
  const { form, set, tick, consTick, known, plan, tkRequired, error, busy, saved, dirty } = f

  useEffect(() => { dialogRef.current?.showModal() }, [])

  useEffect(() => {
    if (tick) dialogRef.current?.querySelector<HTMLInputElement>('[data-testid="product"]')?.focus()
  }, [tick])

  function requestClose() {
    if (busy) return
    if (dirty && !window.confirm('Bỏ các thay đổi chưa lưu?')) return
    onClose()
  }

  // key đổi khi danh mục tải xong → ô gõ khởi tạo lại từ id trong form.
  const select = (label: string, kind: string, key: InspectionIdKey, id: string) => (
    <LookupCombobox key={`${id}-${lookupLoading}-${tick}`} label={label} kind={kind} items={byKind(kind)} server={isBigKind(kind)} known={known[kind]}
      {...f.selectProps(key, id)} reload={reload} testId={id} />
  )

  const construction = (field: 'code' | 'name') => (
    <LookupCombobox key={`construction-${field}-${lookupLoading}-${consTick[field]}`} label={field === 'code' ? 'Mã công trình' : 'Tên công trình'}
      kind="construction" field={field} server known={known.construction} {...f.constructionProps(field)} reload={reload} testId={`construction-${field}`} />
  )

  const fromPlanField = (label: string, value: string, id: string) => (
    <label className={labelClass}>{label}
      <input readOnly className={`${inputClass} bg-stone-100`} value={value} data-testid={id} />
      <span className="text-sm font-normal text-muted">Lấy theo số phiếu TK</span>
    </label>
  )

  return (
    <dialog ref={dialogRef} data-testid="inspection-modal" aria-labelledby="inspection-modal-title"
      onCancel={(e) => { e.preventDefault(); requestClose() }}
      // Ctrl+Enter = Lưu (bỏ qua nếu ô gợi ý đang chọn bằng Enter)
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.defaultPrevented) { e.preventDefault(); formRef.current?.requestSubmit() } }}
      className="p-0 w-full max-w-[640px] max-h-[90vh] overflow-hidden rounded-2xl border-t-4 border-primary-brand shadow-2xl backdrop:bg-slate-900/60 open:flex flex-col max-sm:max-w-none max-sm:max-h-none max-sm:w-screen max-sm:h-dvh max-sm:rounded-none">
      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); void f.save(false) }} className="flex flex-col min-h-0 flex-1" data-testid="inspection-form">
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-4 py-3">
          <div className="min-w-0">
            <h2 id="inspection-modal-title" className="text-lg font-bold">{row ? (readOnly ? 'Xem dòng bảng kiểm' : 'Sửa dòng bảng kiểm') : 'Thêm dòng bảng kiểm'}</h2>
            {row && <AuditNote row={row} />}
          </div>
          <button type="button" onClick={requestClose} aria-label="Đóng" className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 transition-colors duration-150 hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="inspection-close"><Icon name="close" /></button>
        </div>
        {/* Vùng cuộn là <div>, không phải <fieldset>: fieldset có min-size riêng nên không co trong flex → đè lên chân modal. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-testid="modal-body">
        <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-3 border-0 p-0">
          {readOnly && <p className="rounded-card border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900" data-testid="readonly-note">{EDIT_DENIED_HINT}. Bạn chỉ xem được dòng này.</p>}
          <label className={labelClass}>Ngày xuất
            <DateInput value={form.exportDate} onChange={(v) => set('exportDate', v)} data-testid="export-date" />
          </label>
          <LookupCombobox key="tk" label={tkRequired ? 'Số phiếu thống kê (bắt buộc)' : 'Số phiếu thống kê (dòng cũ, có thể để trống)'} kind="plan" allowAdd={false}
            server known={known.plan} {...f.tkProps} testId="tk" />
          {fromPlanField('Số lệnh VC', plan?.transport_order_no ?? '', 'ro-order-no')}
          <LookupCombobox key={`shipper-${lookupLoading}-${tick}-${f.planShipper}`} label="NV xuất hàng" kind="fg_exporter" allowAdd={false}
            items={f.shippers} {...f.shipperProps} testId="shipper" />
          <p className="-mt-2 text-sm text-muted">Mặc định theo phiếu TK, có thể chọn người khác</p>
          {fromPlanField('Số xe', plan?.vehicle?.name ?? '', 'ro-vehicle')}
          {fromPlanField('Tên tài xế/ phụ xe', plan?.driver?.name ?? '', 'ro-driver')}
          <label className={labelClass}>Số phiếu xuất kho
            <input className={inputClass} value={form.slipNo} onChange={(e) => set('slipNo', e.target.value)} data-testid="slip-no" />
          </label>
          {construction('code')}
          {construction('name')}
          <label className={labelClass}>Hạng mục
            <input className={inputClass} value={form.workItem} onChange={(e) => set('workItem', e.target.value)} data-testid="work-item" />
          </label>
          {select('Đơn vị giao hàng', 'delivery_unit', 'deliveryUnitId', 'delivery-unit')}
          {select('Đơn vị nhận hàng', 'receiving_unit', 'receivingUnitId', 'receiving-unit')}
          {select('Loại hình xuất', 'export_type', 'exportTypeId', 'export-type')}
          {select('Mặt hàng', 'product', 'productId', 'product')}
          {select('ĐVT', 'unit', 'unitId', 'unit')}
          <label className={labelClass}>Số lượng xuất (PCS)
            <input inputMode="decimal" className={inputClass} placeholder="vd 12.500,94" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} data-testid="quantity" />
          </label>
          <label className={labelClass}>Tổng khối lượng (kg)
            <input inputMode="decimal" className={inputClass} placeholder="vd 12.500,94" value={form.weight} onChange={(e) => set('weight', e.target.value)} data-testid="weight" />
          </label>
          {select('Nhà xe', 'carrier', 'carrierId', 'carrier')}
          <label className={labelClass}>Ghi chú
            <textarea rows={3} className={inputClass} value={form.note} onChange={(e) => set('note', e.target.value)} data-testid="note" />
          </label>
          {(error || lookupError) && <p role="alert" className="rounded-card border border-danger-line bg-danger-soft p-2 text-danger" data-testid="inspection-error">{error || lookupError}</p>}
        </fieldset>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-stone-200 bg-surface px-4 py-3">
          {saved && <p role="status" className="mr-auto text-sm font-medium text-success" data-testid="inspection-saved">{saved}</p>}
          <Button onClick={requestClose} data-testid="inspection-cancel">{readOnly ? 'Đóng' : 'Hủy'}</Button>
          {!row && (
            <Button disabled={busy} onClick={() => void f.save(true)} className="!border-primary-line !text-primary hover:!bg-primary-soft" data-testid="inspection-save-next">
              Lưu và thêm dòng tiếp
            </Button>
          )}
          {!readOnly && (
            <Button type="submit" variant="primary" disabled={busy} title="Lưu (Ctrl+Enter)" data-testid="inspection-save">
              {busy ? 'Đang lưu...' : row ? 'Cập nhật' : 'Lưu'}
            </Button>
          )}
        </div>
      </form>
    </dialog>
  )
}
