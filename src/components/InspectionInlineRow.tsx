import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { formatDate } from '../lib/format'
import { lookupName, useShareDraft } from '../lib/presence'
import type { LookupItem } from '../lib/useLookups'
import { isBigKind, recall } from '../lib/lookupSearch'
import { useInspectionForm, type InspectionForm, type InspectionIdKey } from '../lib/useInspectionForm'
import LookupCombobox from './LookupCombobox'
import DateInput from './ui/DateInput'
import { IconButton } from './ui/Button'
import InlineEntryRow, { type InlineControls } from './ui/InlineEntryRow'
import { inputClass, inputSmClass } from './ui/Input'

import type { InspectionRow } from '../types/inspection'

const TK_FIRST = 'Chọn Số phiếu TK trước'

type Props = {
  columnKeys: string[]
  lookups: { byKind: (k: string) => LookupItem[]; loading: boolean; error: string; reload: () => Promise<void> }
  onSaved: (message: string) => void
  onCancel: () => void
  controlsRef?: MutableRefObject<InlineControls | null>
  onBusy?: (busy: boolean) => void
  row?: InspectionRow // có: sửa tại chỗ dòng này (D-030) thay vì thêm mới
  seed?: InspectionForm // dòng thêm mới điền sẵn từ dòng trước
  onAddRow?: (seed: InspectionForm) => void // có: hiện nút "+" thêm một dòng nhập mới bên dưới, điền sẵn phiếu/ngày/công trình… của dòng này
  nextSeedRef?: MutableRefObject<(() => InspectionForm) | null> // trang lấy "dòng kế tiếp" của dòng này (nút Thêm dòng trên đầu trang)
}

// Dòng nhập bảng kiểm mới ngay trên bảng (D-023) hoặc dòng đang sửa tại chỗ (D-030). Thêm mới: Số phiếu TK nhập trước; chưa có thì mọi ô khác bị khóa.
export default function InspectionInlineRow({ columnKeys, lookups, onSaved, onCancel, controlsRef, onBusy, row, seed, onAddRow, nextSeedRef }: Props) {
  const { byKind, loading: lookupLoading, error: lookupError, reload } = lookups
  const dateRef = useRef<HTMLInputElement>(null)
  const tkCell = useRef<HTMLDivElement>(null)
  const productCell = useRef<HTMLDivElement>(null)
  const f = useInspectionForm({ row: row ?? null, lookups, validity: dateRef, onSaved: (msg) => onSaved(msg), seed })
  const { form, set, tick, consTick, known, plan } = f
  const editing = !!row
  const locked = form.planId === null && !(editing && row.plan_id === null) // dòng cũ không có TK vẫn sửa được
  const hint = locked ? TK_FIRST : ''

  useEffect(() => { (editing || seed ? productCell : tkCell).current?.querySelector('input')?.focus() }, [editing, seed]) // dòng có sẵn phiếu: nhảy tới Mặt hàng
  useEffect(() => { if (tick) productCell.current?.querySelector('input')?.focus() }, [tick])
  useEffect(() => {
    if (nextSeedRef) nextSeedRef.current = f.nextForm
    return () => { if (nextSeedRef) nextSeedRef.current = null }
  })

  // D-025: cho người khác thấy dòng đang nhập và ô đang đứng. Sửa dòng có sẵn không chia sẻ nháp (đã có nhãn "đang sửa").
  const [focus, setFocus] = useState<string | undefined>()
  const nm = (kind: string, id: number | null) => lookupName(byKind(kind), kind, id)
  useShareDraft(editing ? null : {
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
    <InlineEntryRow testId={editing ? 'inspection-edit-row' : 'inspection-inline-row'} columnKeys={columnKeys} cells={cells} busy={f.busy} dirty={f.dirty} saveLabel="Lưu dòng" controlsRef={controlsRef} onBusy={onBusy} onFocusCell={setFocus}
      cellTitle={(k) => (locked && k !== 'tk' && k !== 'actions' ? TK_FIRST : undefined)}
      extraActions={onAddRow && !editing && (
        <IconButton icon="plus" label="Thêm dòng bên dưới (giữ số phiếu, ngày, công trình… của dòng này)" disabled={f.busy} onClick={() => onAddRow(f.nextForm())} data-testid="inspection-inline-row-add" />
      )}
      error={f.error || lookupError} onSave={() => f.save(!editing)} onCancel={onCancel} />
  )
}
