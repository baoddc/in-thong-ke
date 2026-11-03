import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { formatDate } from '../lib/format'
import { lookupName, useShareDraft } from '../lib/presence'
import type { LookupItem } from '../lib/useLookups'
import { isBigKind, recall } from '../lib/lookupSearch'
import { useInspectionForm, type InspectionIdKey } from '../lib/useInspectionForm'
import LookupCombobox from './LookupCombobox'
import DateInput from './ui/DateInput'
import InlineEntryRow, { type InlineControls } from './ui/InlineEntryRow'
import { inputClass, inputSmClass } from './ui/Input'

const TK_FIRST = 'Chọn Số phiếu TK trước'

type Props = {
  columnKeys: string[]
  lookups: { byKind: (k: string) => LookupItem[]; loading: boolean; error: string; reload: () => Promise<void> }
  onSaved: (message: string) => void
  onCancel: () => void
  controlsRef: MutableRefObject<InlineControls | null>
  onBusy: (busy: boolean) => void
}

// Dòng nhập bảng kiểm mới ngay trên bảng (D-023). Số phiếu TK nhập trước; chưa có thì mọi ô khác bị khóa.
export default function InspectionInlineRow({ columnKeys, lookups, onSaved, onCancel, controlsRef, onBusy }: Props) {
  const { byKind, loading: lookupLoading, error: lookupError, reload } = lookups
  const dateRef = useRef<HTMLInputElement>(null)
  const tkCell = useRef<HTMLDivElement>(null)
  const productCell = useRef<HTMLDivElement>(null)
  const f = useInspectionForm({ row: null, lookups, validity: dateRef, onSaved: (msg) => onSaved(msg) })
  const { form, set, tick, consTick, known, plan } = f
  const locked = form.planId === null
  const hint = locked ? TK_FIRST : ''

  useEffect(() => { tkCell.current?.querySelector('input')?.focus() }, [])
  useEffect(() => { if (tick) productCell.current?.querySelector('input')?.focus() }, [tick])

  // D-025: cho người khác thấy dòng đang nhập và ô đang đứng.
  const [focus, setFocus] = useState<string | undefined>()
  const nm = (kind: string, id: number | null) => lookupName(byKind(kind), kind, id)
  useShareDraft({
    table: 'details', focus,
    values: {
      date: formatDate(form.exportDate), tk: plan?.tk_number ?? lookupName([], 'plan', form.planId), order: plan?.transport_order_no ?? '', slip: form.slipNo,
      ccode: recall('construction', form.constructionId ?? 0)?.code ?? '', cname: nm('construction', form.constructionId), item: form.workItem,
      from: nm('delivery_unit', f.selectProps('deliveryUnitId', 'delivery-unit').selectedIds[0] ?? null), to: nm('receiving_unit', form.receivingUnitId),
      etype: nm('export_type', form.exportTypeId), product: nm('product', form.productId), unit: nm('unit', form.unitId), qty: form.quantity, weight: form.weight,
      shipper: lookupName(f.shippers, 'fg_exporter', f.shipperProps.selectedIds[0] ?? null), vehicle: plan?.vehicle?.name ?? '', driver: plan?.driver?.name ?? '',
      carrier: nm('carrier', form.carrierId), note: form.note,
    },
  })

  const text = `${inputClass} ${inputSmClass}`
  const select = (label: string, kind: string, key: InspectionIdKey, id: string) => (
    <LookupCombobox key={`${id}-${lookupLoading}-${tick}`} hideLabel disabled={locked} placeholder={hint || undefined} label={label} kind={kind} items={byKind(kind)} server={isBigKind(kind)} known={known[kind]}
      {...f.selectProps(key, id)} reload={reload} testId={`inline-${id}`} />
  )
  const construction = (field: 'code' | 'name') => (
    <LookupCombobox key={`construction-${field}-${lookupLoading}-${consTick[field]}`} hideLabel disabled={locked} placeholder={hint || undefined} label={field === 'code' ? 'Mã công trình' : 'Tên công trình'}
      kind="construction" field={field} server known={known.construction} {...f.constructionProps(field)} reload={reload} testId={`inline-construction-${field}`} />
  )
  const plain = (label: string, value: string, onChange: (v: string) => void, id: string, numeric = false) => (
    <input aria-label={label} inputMode={numeric ? 'decimal' : undefined} disabled={locked} placeholder={hint || (numeric ? 'vd 12.500,94' : undefined)}
      className={text} value={value} onChange={(e) => onChange(e.target.value)} data-testid={`inline-${id}`} />
  )
  const readonly = (label: string, value: string, id: string) => (
    <input aria-label={`${label} (lấy theo số phiếu TK)`} readOnly tabIndex={-1} className={`${text} bg-stone-100`} value={value} data-testid={`inline-${id}`} />
  )

  const cells = {
    date: (
      <label>
        <span className="sr-only">Ngày xuất</span>
        <DateInput ref={dateRef} inputSize="sm" disabled={locked} value={form.exportDate} onChange={(v) => set('exportDate', v)} data-testid="inline-export-date" />
      </label>
    ),
    tk: (
      <div ref={tkCell}>
        <LookupCombobox hideLabel label="Số phiếu thống kê (bắt buộc)" placeholder="Chọn số phiếu TK" kind="plan" allowAdd={false} server known={known.plan} {...f.tkProps} testId="inline-tk" />
      </div>
    ),
    order: readonly('Số lệnh VC', plan?.transport_order_no ?? '', 'ro-order-no'),
    slip: plain('Số phiếu xuất kho', form.slipNo, (v) => set('slipNo', v), 'slip-no'),
    ccode: construction('code'),
    cname: construction('name'),
    item: plain('Hạng mục', form.workItem, (v) => set('workItem', v), 'work-item'),
    from: select('Đơn vị giao hàng', 'delivery_unit', 'deliveryUnitId', 'delivery-unit'),
    to: select('Đơn vị nhận hàng', 'receiving_unit', 'receivingUnitId', 'receiving-unit'),
    etype: select('Loại hình xuất', 'export_type', 'exportTypeId', 'export-type'),
    product: <div ref={productCell}>{select('Mặt hàng', 'product', 'productId', 'product')}</div>,
    unit: select('ĐVT', 'unit', 'unitId', 'unit'),
    qty: plain('Số lượng xuất (PCS)', form.quantity, (v) => set('quantity', v), 'quantity', true),
    weight: plain('Tổng khối lượng (kg)', form.weight, (v) => set('weight', v), 'weight', true),
    shipper: (
      <LookupCombobox key={`shipper-${lookupLoading}-${tick}-${f.planShipper}`} hideLabel disabled={locked} placeholder={hint || undefined} label="NV xuất hàng" kind="fg_exporter" allowAdd={false}
        items={f.shippers} {...f.shipperProps} testId="inline-shipper" />
    ),
    vehicle: readonly('Số xe', plan?.vehicle?.name ?? '', 'ro-vehicle'),
    driver: readonly('Tên tài xế/ phụ xe', plan?.driver?.name ?? '', 'ro-driver'),
    carrier: select('Nhà xe', 'carrier', 'carrierId', 'carrier'),
    note: plain('Ghi chú', form.note, (v) => set('note', v), 'note'),
  }

  return (
    <InlineEntryRow testId="inspection-inline-row" columnKeys={columnKeys} cells={cells} busy={f.busy} dirty={f.dirty} saveLabel="Lưu dòng" controlsRef={controlsRef} onBusy={onBusy} onFocusCell={setFocus}
      cellTitle={(k) => (locked && k !== 'tk' && k !== 'actions' ? TK_FIRST : undefined)}
      error={f.error || lookupError} onSave={() => void f.save(true)} onCancel={onCancel} />
  )
}
