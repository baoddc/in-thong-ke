import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { formatDate } from '../lib/format'
import { lookupName, useShareDraft } from '../lib/presence'
import type { LookupItem } from '../lib/useLookups'
import { isBigKind } from '../lib/lookupSearch'
import { formatCountdown, usePlanForm } from '../lib/usePlanForm'
import LookupCombobox from './LookupCombobox'
import DateInput from './ui/DateInput'
import InlineEntryRow, { type InlineControls } from './ui/InlineEntryRow'
import { inputClass, inputSmClass } from './ui/Input'

type Props = {
  columnKeys: string[]
  lookups: { byKind: (k: string) => LookupItem[]; loading: boolean; error: string; reload: () => Promise<void> }
  onSaved: (message: string) => void
  onCancel: () => void
  onExpired: (message: string) => void
  controlsRef: MutableRefObject<InlineControls | null>
  onBusy: (busy: boolean) => void
}

// Dòng nhập phiếu mới ngay trên bảng (D-023). Mount = bắt đầu giữ số TK; page đổi `key` sau khi lưu để nhập dòng kế.
export default function PlanInlineRow({ columnKeys, lookups, onSaved, onCancel, onExpired, controlsRef, onBusy }: Props) {
  const { byKind, loading: lookupLoading, error: lookupError, reload } = lookups
  const dateRef = useRef<HTMLInputElement>(null)
  const { form, set, error, busy, dirty, hold, known, selectProps, submit, defaulted } = usePlanForm({ plan: null, onSaved, onExpired, lookups })
  useEffect(() => { dateRef.current?.focus() }, [])

  // D-025: cho người khác thấy dòng đang nhập (tên danh mục, không phải id) và ô đang đứng.
  const [focus, setFocus] = useState<string | undefined>()
  const nm = (kind: string, id: number | null) => lookupName(byKind(kind), kind, id)
  useShareDraft({
    table: 'plans', focus, expiresAt: hold.expiresAt || undefined,
    values: {
      tk: hold.number, date: formatDate(form.exportDate), order: form.orderNo, type: nm('transport_type', form.transportTypeId), vehicle: nm('vehicle', form.vehicleId),
      driver: nm('driver', form.driverId), fg: nm('fg_exporter', form.fgExporterId), mat: form.materialIds.map((id) => nm('material_exporter', id)).filter(Boolean).join(', '), note: form.note,
    },
  })

  const select = (label: string, kind: string, key: 'transportTypeId' | 'vehicleId' | 'driverId' | 'fgExporterId', id: string) => (
    <LookupCombobox key={`${id}-${lookupLoading}-${defaulted}`} hideLabel label={label} kind={kind} items={byKind(kind)} server={isBigKind(kind)} known={known[kind]}
      {...selectProps(key, id)} reload={reload} testId={`inline-${id}`} />
  )
  const text = `${inputClass} ${inputSmClass}`

  const cells = {
    tk: (
      <div onFocus={hold.touch} onClick={hold.touch}>
        <label className="sr-only" htmlFor="inline-tk-number">Số phiếu thống kê</label>
        <input id="inline-tk-number" readOnly className={`${text} bg-stone-100 font-semibold text-primary`} value={hold.number} data-testid="inline-tk-number" />
        {hold.number && !hold.expired && <span className="block text-xs text-muted" data-testid="inline-tk-hold-note">Giữ 5 phút · còn <span className="font-semibold tabular-nums" data-testid="inline-tk-hold-timer">{formatCountdown(hold.remaining)}</span></span>}
      </div>
    ),
    date: (
      <label>
        <span className="sr-only">Ngày xuất</span>
        <DateInput ref={dateRef} required inputSize="sm" value={form.exportDate} onChange={(v) => set('exportDate', v)} data-testid="inline-export-date" />
      </label>
    ),
    order: <input aria-label="Số lệnh VC" className={text} value={form.orderNo} onChange={(e) => set('orderNo', e.target.value)} data-testid="inline-order-no" />,
    type: select('Phân loại VC', 'transport_type', 'transportTypeId', 'transport-type'),
    vehicle: select('Số xe lấy hàng', 'vehicle', 'vehicleId', 'vehicle'),
    driver: select('Tên tài xế/ phụ xe', 'driver', 'driverId', 'driver'),
    fg: select('NV Xuất TP/BTP', 'fg_exporter', 'fgExporterId', 'fg-exporter'),
    mat: (
      <LookupCombobox key={`mat-${lookupLoading}`} hideLabel label="NV Xuất VT" kind="material_exporter" items={byKind('material_exporter')}
        selectedIds={form.materialIds} multiple onChange={(ids) => set('materialIds', ids)} reload={reload} testId="inline-material-exporters" />
    ),
    note: <input aria-label="Ghi chú" className={text} value={form.note} onChange={(e) => set('note', e.target.value)} data-testid="inline-note" />,
  }

  return (
    <InlineEntryRow testId="plan-inline-row" columnKeys={columnKeys} cells={cells} busy={busy} dirty={dirty} saveLabel="Lưu phiếu" controlsRef={controlsRef} onBusy={onBusy} onFocusCell={setFocus}
      error={error || lookupError || hold.error} onSave={() => void submit()} onCancel={onCancel} />
  )
}
