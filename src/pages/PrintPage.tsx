import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/format'
import { recall } from '../lib/lookupSearch'
import { PLAN_SELECT } from '../lib/plans'
import LookupCombobox from '../components/LookupCombobox'
import PrintSheet from '../components/PrintSheet'
import Button from '../components/ui/Button'
import PageHeader from '../components/ui/PageHeader'
import type { PlanRow } from '../types/plan'
import type { InspectionRow } from '../types/inspection'

type Loaded = { tk: string; plan: PlanRow | null; rows: InspectionRow[] }

export default function PrintPage() {
  const [params, setParams] = useSearchParams()
  const tk = params.get('tk') ?? ''
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0) // tăng để thử lại
  const loaded = data && data.tk === tk ? data : null

  // Tra phiếu theo số TK trong URL (không tải danh sách số TK), rồi tải các dòng bảng kiểm của phiếu.
  useEffect(() => {
    if (!tk) return
    let alive = true
    ;(async () => {
      const p = await supabase.from('transport_plans').select(PLAN_SELECT).eq('tk_number', tk).maybeSingle()
      const plan = p.data as unknown as PlanRow | null
      const r = plan && !p.error
        ? await supabase.from('inspection_details_view').select('*').eq('plan_id', plan.id).order('export_date').order('warehouse_slip_no').order('id')
        : null
      if (!alive) return
      const err = p.error ?? r?.error
      if (err) return setError(errorMessage(err))
      setError('')
      setData({ tk, plan, rows: (r?.data ?? []) as unknown as InspectionRow[] })
    })()
    return () => { alive = false }
  }, [tk, attempt])

  const onChange = (ids: number[]) => {
    const name = ids[0] === undefined ? undefined : recall('plan', ids[0])?.name
    setParams(name ? { tk: name } : {}, { replace: true })
  }

  const plan = loaded?.plan ?? null
  return (
    <div className="space-y-4">
      <div className="print:hidden space-y-4">
        <PageHeader title="In thống kê" description="Chọn số phiếu TK, xem trước rồi in bản bàn giao phiếu xuất kho" />
        <div className="flex flex-wrap items-end gap-3 rounded-card border border-stone-200 bg-white p-3 shadow-card">
          <div className="w-full sm:w-72">
            <LookupCombobox key={`tk-${plan?.id ?? 0}`} label="Số phiếu TK" kind="plan" allowAdd={false} server
              known={plan ? [{ id: plan.id, name: plan.tk_number }] : []} selectedIds={plan ? [plan.id] : []} onChange={onChange} testId="print-tk-input" />
          </div>
          <Button variant="primary" icon="print" onClick={() => window.print()} disabled={!plan} data-testid="print-button">In</Button>
        </div>
        {error && (
          <p role="alert" className="flex flex-wrap items-center gap-2 rounded-card border border-danger-line bg-danger-soft p-3 text-danger" data-testid="print-error">
            {error} <Button size="sm" onClick={() => setAttempt((a) => a + 1)}>Thử lại</Button>
          </p>
        )}
        {!tk && <p className="text-muted">Nhập số phiếu TK để xem trước bản in.</p>}
        {tk && !loaded && !error && <p className="animate-pulse text-muted" data-testid="print-loading">Đang tải...</p>}
        {loaded && !plan && <p className="text-muted" data-testid="print-not-found">Không tìm thấy phiếu {tk}.</p>}
        {plan && loaded && loaded.rows.length === 0 && <p className="rounded-card border border-amber-200 bg-amber-50 p-3 text-amber-900" data-testid="print-empty">Phiếu này chưa có dòng nào trong Bảng kiểm</p>}
      </div>
      {plan && loaded && (
        <div className="overflow-x-auto rounded-card bg-stone-200 p-2 print:overflow-visible print:rounded-none print:bg-transparent print:p-0">
          <PrintSheet plan={plan} rows={loaded.rows} />
        </div>
      )}
    </div>
  )
}
