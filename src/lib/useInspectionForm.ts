import { useEffect, useState, type RefObject } from 'react'
import { supabase } from './supabase'
import { errorMessage, formatNumber, parseVnNumber, todayISO } from './format'
import type { LookupItem } from './useLookups'
import type { Opt } from './lookupSearch'
import { EDIT_DENIED_HINT } from './auth'
import { useReportActivity } from './presence'
import { PLAN_SELECT, mergeShippers, planShipperId, shipperIdToSave } from './plans'
import type { PlanRow } from '../types/plan'
import type { InspectionRow } from '../types/inspection'

export type InspectionIdKey = 'deliveryUnitId' | 'receivingUnitId' | 'exportTypeId' | 'productId' | 'unitId' | 'carrierId'
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
  readOnly?: boolean
  lookups: { byKind: (k: string) => LookupItem[]; loading: boolean; reload: () => Promise<void> }
  validity: RefObject<{ reportValidity: () => boolean }> // form (modal) hoặc ô ngày (dòng nhập): kiểm tra ngày gõ sai trước khi lưu
  onSaved: (message: string, keepOpen: boolean) => void
}

/** State + kiểm tra + lưu của form dòng bảng kiểm, dùng chung cho modal và dòng nhập trên bảng. */
export function useInspectionForm({ row, readOnly = false, lookups, validity, onSaved }: Props) {
  const { byKind } = lookups
  // Tên các id có sẵn trong dòng đang sửa (view) → ô tìm phía server hiện ngay, không gọi thêm.
  const known: Record<string, Opt[]> = {
    plan: row?.plan_id && row.tk_number ? [{ id: row.plan_id, name: row.tk_number }] : [],
    receiving_unit: row?.receiving_unit_id ? [{ id: row.receiving_unit_id, name: row.receiving_unit_name ?? '' }] : [],
    construction: row?.construction_id ? [{ id: row.construction_id, name: row.construction_name ?? '', code: row.construction_code }] : [],
  }
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
  useReportActivity(readOnly ? null : row ? { kind: 'editing_detail', detailId: row.id, tk: row.tk_number ?? '' } : { kind: 'adding_detail', tk: plan?.tk_number })

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

  async function save(andNext: boolean) {
    if (busy || readOnly) return
    if (!validity.current?.reportValidity()) return // vd ngày xuất gõ sai (nút "Lưu và thêm dòng tiếp" không qua kiểm tra của form)
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

  /** Thuộc tính nối ô LookupCombobox ô đơn với form. */
  const selectProps = (key: InspectionIdKey, id: string) => {
    const cur = key === 'deliveryUnitId' ? deliveryUnitId : form[key]
    return { selectedIds: cur === null ? [] : [cur], onChange: (ids: number[]) => set(key, ids[0] ?? null), onPending: (p: boolean) => setPending((s) => ({ ...s, [id]: p })) }
  }

  // Mã và Tên cùng chỉ một mục 'construction': chọn/xóa ở ô này thì ô kia khởi tạo lại (điền theo mục đã chọn hoặc để trống).
  const constructionProps = (field: 'code' | 'name') => {
    const other = field === 'code' ? 'name' : 'code'
    const id = `construction-${field}`
    return {
      selectedIds: form.constructionId === null ? [] : [form.constructionId],
      onChange: (ids: number[]) => {
        set('constructionId', ids[0] ?? null)
        setConsTick((t) => ({ ...t, [other]: t[other] + 1 }))
        setPending((s) => ({ ...s, [`construction-${other}`]: false }))
      },
      onPending: (p: boolean) => setPending((s) => ({ ...s, [id]: p })),
    }
  }

  const tkProps = {
    selectedIds: form.planId === null ? [] : [form.planId],
    onChange: (ids: number[]) => { set('planId', ids[0] ?? null); setPending((s) => ({ ...s, shipper: false })) },
    onPending: (p: boolean) => setPending((s) => ({ ...s, tk: p })),
  }
  const shipperProps = {
    selectedIds: shipperId === null ? [] : [shipperId],
    onChange: (ids: number[]) => set('shipperId', ids[0] ?? null),
    onPending: (p: boolean) => setPending((s) => ({ ...s, shipper: p })),
  }

  return { form, set, error, busy, saved, tick, consTick, dirty, known, tkRequired, plan, shippers, planShipper, save, selectProps, constructionProps, tkProps, shipperProps }
}
