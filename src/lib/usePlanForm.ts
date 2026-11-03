import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { errorMessage, todayISO } from './format'
import { sortedMaterials } from './plans'
import { useTkReservation } from './useTkReservation'
import { useReportActivity } from './presence'
import type { Opt } from './lookupSearch'
import type { PlanRow } from '../types/plan'

export type PlanForm = {
  exportDate: string; orderNo: string; transportTypeId: number | null; vehicleId: number | null; driverId: number | null
  fgExporterId: number | null; materialIds: number[]; note: string
}
type IdKey = 'transportTypeId' | 'vehicleId' | 'driverId' | 'fgExporterId'

const fromPlan = (p: PlanRow | null): PlanForm => ({
  exportDate: p?.export_date ?? todayISO(), orderNo: p?.transport_order_no ?? '',
  transportTypeId: p?.transport_type_id ?? null, vehicleId: p?.vehicle_id ?? null, driverId: p?.driver_id ?? null,
  fgExporterId: p?.fg_exporter_id ?? null,
  materialIds: (p ? sortedMaterials(p) : []).flatMap((m) => (m.lookup ? [m.lookup.id] : [])),
  note: p?.note ?? '',
})

export const formatCountdown = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

/** State + kiểm tra + lưu của form phiếu, dùng chung cho modal và dòng nhập trên bảng. Thêm mới (plan null) thì giữ số TK. */
export function usePlanForm({ plan, readOnly = false, onSaved, onExpired }: { plan: PlanRow | null; readOnly?: boolean; onSaved: (message: string) => void; onExpired?: (message: string) => void }) {
  const [initial] = useState(() => fromPlan(plan))
  const [form, setForm] = useState(initial)
  const [pending, setPending] = useState<Record<string, boolean>>({}) // ô đơn có chữ nhưng chưa chọn
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Thêm mới: giữ số TK 5 phút (D-018); đóng/hủy/unmount mà chưa lưu → hook tự release.
  const hold = useTkReservation(!plan && !readOnly)
  const { touch } = hold
  // Hết hạn giữ số (đã qua cơ chế gia hạn) → báo trang đóng dòng nhập/modal; unmount tự release + gửi clear nháp/activity.
  const expiredRef = useRef(onExpired)
  useEffect(() => { expiredRef.current = onExpired })
  const { expired, number } = hold
  useEffect(() => {
    if (expired && !plan) expiredRef.current?.(`Hết thời gian giữ số ${number} — dòng nhập đã bị hủy`)
  }, [expired, number, plan])
  useReportActivity(readOnly ? null : plan ? { kind: 'editing_plan', planId: plan.id, tk: plan.tk_number } : hold.number && !hold.expired ? { kind: 'adding_plan', tk: hold.number, expiresAt: hold.expiresAt } : null)

  const set = <K extends keyof PlanForm>(k: K, v: PlanForm[K]) => { touch(); setForm((f) => ({ ...f, [k]: v })) }
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || Object.values(pending).some(Boolean)

  // Tên xe/tài xế có sẵn trong phiếu đang sửa → ô tìm phía server hiện ngay.
  const known: Record<string, Opt[]> = {
    vehicle: plan?.vehicle_id && plan.vehicle ? [{ id: plan.vehicle_id, name: plan.vehicle.name }] : [],
    driver: plan?.driver_id && plan.driver ? [{ id: plan.driver_id, name: plan.driver.name }] : [],
  }

  /** Thuộc tính nối ô LookupCombobox ô đơn với form. */
  const selectProps = (key: IdKey, id: string) => {
    const cur = form[key]
    return { selectedIds: cur === null ? [] : [cur], onChange: (ids: number[]) => set(key, ids[0] ?? null), onPending: (p: boolean) => setPending((s) => ({ ...s, [id]: p })) }
  }

  async function submit() {
    if (busy || readOnly) return
    if (!form.exportDate) return setError('Vui lòng chọn ngày xuất.')
    if (Object.values(pending).some(Boolean)) return setError('Có ô đã gõ chữ nhưng chưa chọn từ danh mục. Vui lòng chọn một mục hoặc xóa chữ.')
    setBusy(true)
    setError('')
    const args = {
      p_export_date: form.exportDate,
      p_transport_order_no: form.orderNo.trim() || null,
      p_transport_type_id: form.transportTypeId,
      p_vehicle_id: form.vehicleId,
      p_driver_id: form.driverId,
      p_fg_exporter_id: form.fgExporterId,
      p_material_exporter_ids: form.materialIds,
      p_note: form.note.trim() || null,
    }
    const res = plan
      ? await supabase.rpc('update_transport_plan', { p_id: plan.id, ...args })
      : await supabase.rpc('create_transport_plan', args)
    setBusy(false)
    if (res.error) return setError(errorMessage(res.error))
    if (plan) return onSaved(`Đã cập nhật phiếu ${plan.tk_number}`)
    hold.markSaved() // máy chủ đã xóa chỗ giữ khi lưu → không release thừa
    const tk = res.data.tk_number
    onSaved(hold.number && tk !== hold.number ? `Số phiếu đã đổi thành ${tk} do hết thời gian giữ` : `Đã lưu phiếu ${tk}`)
  }

  return { form, set, setPending, pending, error, busy, dirty, hold, known, selectProps, submit }
}
