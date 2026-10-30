import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage, formatNumber, parseVnNumber, todayISO } from '../lib/format'
import type { LookupItem } from '../lib/useLookups'
import { isBigKind, type Opt } from '../lib/lookupSearch'
import { EDIT_DENIED_HINT } from '../lib/auth'
import { PLAN_SELECT, mergeShippers, planShipperId, shipperIdToSave } from '../lib/plans'
import { AuditNote } from './AuditInfo'
import LookupCombobox from './LookupCombobox'
import Button from './ui/Button'
import DateInput from './ui/DateInput'
import Icon from './ui/Icon'
import { inputClass, labelClass } from './ui/Input'
import type { PlanRow } from '../types/plan'
import type { InspectionRow } from '../types/inspection'

type IdKey = 'deliveryUnitId' | 'receivingUnitId' | 'exportTypeId' | 'productId' | 'unitId' | 'carrierId'
type Form = {
  planId: number | null; exportDate: string; slipNo: string; constructionId: number | null; workItem: string
  deliveryUnitId: number | null | undefined // undefined: chưa chọn → mặc định "An Hạ"
  receivingUnitId: number | null; exportTypeId: number | null; productId: number | null; unitId: number | null
  quantity: string; weight: string; carrierId: number | null; note: string
  shipperId: number | null // null: theo phiếu TK
}

const fromRow = (r: InspectionRow | null): Form => ({
  planId: r?.plan_id ?? null, exportDate: r?.export_date ?? '', slipNo: r?.warehouse_slip_no ?? '',
  constructionId: r?.construction_id ?? null, workItem: r?.work_item ?? '',
  deliveryUnitId: r ? r.delivery_unit_id : undefined, receivingUnitId: r?.receiving_unit_id ?? null,
  exportTypeId: r?.export_type_id ?? null, productId: r?.product_id ?? null, unitId: r?.unit_id ?? null,
  quantity: formatNumber(r?.quantity), weight: formatNumber(r?.total_weight_kg), carrierId: r?.carrier_id ?? null, note: r?.note ?? '', shipperId: r?.shipper_id ?? null,
})

const NUM_ERR = 'Sai định dạng số: dùng dấu phẩy (,) cho phần thập phân, dấu chấm (.) cho hàng nghìn — vd 12.500,94'

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
  // Tên các id có sẵn trong dòng đang sửa (view) → ô tìm phía server hiện ngay, không gọi thêm.
  const known: Record<string, Opt[]> = {
    plan: row?.plan_id && row.tk_number ? [{ id: row.plan_id, name: row.tk_number }] : [],
    receiving_unit: row?.receiving_unit_id ? [{ id: row.receiving_unit_id, name: row.receiving_unit_name ?? '' }] : [],
    construction: row?.construction_id ? [{ id: row.construction_id, name: row.construction_name ?? '', code: row.construction_code }] : [],
  }
  const dialogRef = useRef<HTMLDialogElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [initial, setInitial] = useState(() => fromRow(row))
  const [form, setForm] = useState(initial)
  const [pending, setPending] = useState<Record<string, boolean>>({}) // ô đơn có chữ nhưng chưa chọn
  const [planInfo, setPlanInfo] = useState<PlanRow | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('') // báo đã lưu ngay trong hộp thoại (toast của trang nằm sau lớp nền)
  const [tick, setTick] = useState(0) // tăng sau "Lưu và thêm dòng tiếp" để ô Mặt hàng/ĐVT khởi tạo lại
  const [consTick, setConsTick] = useState({ code: 0, name: 0 }) // ô Mã/Tên công trình khởi tạo lại khi ô kia đổi

  const tkRequired = !(row && row.plan_id === null) // dòng cũ chưa có số phiếu TK thì được để trống
  const defaultDeliveryId = byKind('delivery_unit').find((i) => i.name === 'An Hạ')?.id ?? null
  const deliveryUnitId = form.deliveryUnitId === undefined ? defaultDeliveryId : form.deliveryUnitId
  const plan = planInfo && planInfo.id === form.planId ? planInfo : null
  const shippers = mergeShippers(byKind('fg_exporter'), byKind('material_exporter'))
  const planShipper = planShipperId(shippers, plan)
  const shipperId = form.shipperId ?? planShipper // chưa tự chọn → người theo phiếu

  useEffect(() => { dialogRef.current?.showModal() }, [])

  useEffect(() => {
    if (tick) dialogRef.current?.querySelector<HTMLInputElement>('[data-testid="product"]')?.focus()
  }, [tick])

  // Lookup theo số phiếu TK; ô Ngày xuất còn trống thì điền ngày của phiếu (hoặc hôm nay).
  useEffect(() => {
    if (form.planId === null) return
    let alive = true
    supabase.from('transport_plans').select(PLAN_SELECT).eq('id', form.planId).maybeSingle().then((r) => {
      if (!alive) return
      if (r.error) return setError(errorMessage(r.error))
      const p = r.data as unknown as PlanRow | null
      setPlanInfo(p)
      if (p) setForm((f) => (f.exportDate ? f : { ...f, exportDate: p.export_date ?? todayISO() }))
    })
    return () => { alive = false }
  }, [form.planId])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setSaved(''); setForm((f) => ({ ...f, [k]: v })) }
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || Object.values(pending).some(Boolean)

  function requestClose() {
    if (busy) return
    if (dirty && !window.confirm('Bỏ các thay đổi chưa lưu?')) return
    onClose()
  }

  async function save(andNext: boolean) {
    if (busy || readOnly) return
    if (!formRef.current?.reportValidity()) return // vd ngày xuất gõ sai (nút "Lưu và thêm dòng tiếp" không qua kiểm tra của form)
    if (form.planId === null && tkRequired) return setError('Vui lòng chọn số phiếu thống kê.')
    if (Object.values(pending).some(Boolean)) return setError('Có ô đã gõ chữ nhưng chưa chọn từ danh mục. Vui lòng chọn một mục hoặc xóa chữ.')
    const quantity = parseVnNumber(form.quantity)
    if (Number.isNaN(quantity)) return setError(`Số lượng xuất (PCS): ${NUM_ERR}`)
    const weight = parseVnNumber(form.weight)
    if (Number.isNaN(weight)) return setError(`Tổng khối lượng: ${NUM_ERR}`)
    setBusy(true)
    setError('')
    setSaved('')
    const payload = {
      plan_id: form.planId,
      export_date: form.exportDate || null,
      warehouse_slip_no: form.slipNo.trim() || null,
      construction_id: form.constructionId,
      work_item: form.workItem.trim() || null,
      delivery_unit_id: deliveryUnitId,
      receiving_unit_id: form.receivingUnitId,
      export_type_id: form.exportTypeId,
      product_id: form.productId,
      unit_id: form.unitId,
      quantity,
      total_weight_kg: weight,
      carrier_id: form.carrierId,
      shipper_id: shipperIdToSave(shipperId, planShipper),
      note: form.note.trim() || null,
    }
    const res = row
      ? await supabase.from('inspection_details').update(payload).eq('id', row.id).select('id')
      : await supabase.from('inspection_details').insert(payload)
    setBusy(false)
    if (res.error) return setError(errorMessage(res.error))
    if (row && !res.data?.length) return setError(`Bạn không có quyền sửa dòng này. ${EDIT_DENIED_HINT}.`) // RLS chặn: 0 dòng được cập nhật
    if (!andNext) return onSaved(row ? 'Đã cập nhật dòng' : 'Đã lưu dòng', false)
    const next = { ...form, deliveryUnitId, productId: null, unitId: null, quantity: '', weight: '', note: '' }
    setForm(next)
    setInitial(next)
    setTick((t) => t + 1)
    setSaved('Đã lưu dòng. Nhập dòng tiếp theo.')
    onSaved('Đã lưu dòng', true)
  }

  // key đổi khi danh mục tải xong → ô gõ khởi tạo lại từ id trong form.
  const select = (label: string, kind: string, key: IdKey, id: string) => {
    const cur = key === 'deliveryUnitId' ? deliveryUnitId : form[key]
    return (
      <LookupCombobox key={`${id}-${lookupLoading}-${tick}`} label={label} kind={kind} items={byKind(kind)} server={isBigKind(kind)} known={known[kind]}
        selectedIds={cur === null ? [] : [cur]} onChange={(ids) => set(key, ids[0] ?? null)}
        onPending={(p) => setPending((s) => ({ ...s, [id]: p }))} reload={reload} testId={id} />
    )
  }

  // Mã và Tên cùng chỉ một mục 'construction': chọn/xóa ở ô này thì ô kia khởi tạo lại (điền theo mục đã chọn hoặc để trống).
  const construction = (field: 'code' | 'name') => {
    const other = field === 'code' ? 'name' : 'code'
    const id = `construction-${field}`
    return (
      <LookupCombobox key={`${id}-${lookupLoading}-${consTick[field]}`} label={field === 'code' ? 'Mã công trình' : 'Tên công trình'}
        kind="construction" field={field} server known={known.construction}
        selectedIds={form.constructionId === null ? [] : [form.constructionId]}
        onChange={(ids) => {
          set('constructionId', ids[0] ?? null)
          setConsTick((t) => ({ ...t, [other]: t[other] + 1 }))
          setPending((s) => ({ ...s, [`construction-${other}`]: false }))
        }}
        onPending={(p) => setPending((s) => ({ ...s, [id]: p }))} reload={reload} testId={id} />
    )
  }

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
      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); void save(false) }} className="flex flex-col min-h-0 flex-1" data-testid="inspection-form">
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
            server known={known.plan} selectedIds={form.planId === null ? [] : [form.planId]}
            onChange={(ids) => { set('planId', ids[0] ?? null); setPending((s) => ({ ...s, shipper: false })) }}
            onPending={(p) => setPending((s) => ({ ...s, tk: p }))} testId="tk" />
          {fromPlanField('Số lệnh VC', plan?.transport_order_no ?? '', 'ro-order-no')}
          <LookupCombobox key={`shipper-${lookupLoading}-${tick}-${planShipper}`} label="NV xuất hàng" kind="fg_exporter" allowAdd={false}
            items={shippers} selectedIds={shipperId === null ? [] : [shipperId]} onChange={(ids) => set('shipperId', ids[0] ?? null)}
            onPending={(p) => setPending((s) => ({ ...s, shipper: p }))} testId="shipper" />
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
            <Button disabled={busy} onClick={() => void save(true)} className="!border-primary-line !text-primary hover:!bg-primary-soft" data-testid="inspection-save-next">
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
