import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { errorMessage, formatDate, formatNumber } from '../lib/format'
import { useLookups } from '../lib/useLookups'
import { countActiveFilters, type ListConfig } from '../lib/listQuery'
import { rpcCount, rpcList } from '../lib/listRpc'
import { useListPage, type Fetcher } from '../lib/useListPage'
import { useMonthStats } from '../lib/useMonthStats'
import { useShortcuts } from '../lib/useShortcuts'
import { isSmallScreen, usePersistentToggle } from '../lib/usePersistentToggle'
import { AuditCell } from '../components/AuditInfo'
import PlanFormModal from '../components/PlanFormModal'
import ListToolbar from '../components/ListToolbar'
import { Badge, PersonChip, PersonChips } from '../components/ui/Badge'
import Button, { IconButton, iconButtonClass } from '../components/ui/Button'
import { Collapsible, PanelToggle } from '../components/ui/Collapsible'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import DataTable, { type Column } from '../components/ui/DataTable'
import EmptyState from '../components/ui/EmptyState'
import Icon, { type IconName } from '../components/ui/Icon'
import PageHeader from '../components/ui/PageHeader'
import Pagination from '../components/ui/Pagination'
import { useToast } from '../components/ui/Toast'
import { EDIT_DENIED_HINT, canEditRow, canUpdateRow } from '../lib/auth'
import { untilLabel, useMyEditRequests } from '../lib/useEditRequests'
import { useProfile } from '../lib/useProfile'
import { EditRequestModal } from '../components/EditRequestModals'
import { fromRpcPlan, sortedMaterials, type PlanRpcRow } from '../lib/plans'
import type { PlanRow } from '../types/plan'

const CFG: ListConfig = {
  sorts: ['created_at', 'export_date', 'tk_number', 'transport_order_no'],
  defaultSort: 'created_at', defaultDir: 'desc', descFirst: ['created_at', 'export_date'],
  filterCols: {},
}
// Dữ liệu trang qua RPC (planning nhanh, kèm tên người tạo/sửa — D-017) + đếm qua RPC cùng bộ lọc (D-021), chạy song song.
const fetchPlans: Fetcher = async (p) => {
  const [rows, count] = await Promise.all([rpcList('list_transport_plans', p), rpcCount('count_transport_plans', p)])
  return { data: rows.error ? null : ((rows.data ?? []) as PlanRpcRow[]).map(fromRpcPlan), error: rows.error, count }
}

const PILL = 'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold'

// Màu theo thẻ: đỏ (thương hiệu), xanh dương (thông tin), cam (khối lượng). Viết nguyên chuỗi để Tailwind quét được.
const TONES = {
  red: { box: 'bg-primary text-white', card: 'from-primary-soft' },
  blue: { box: 'bg-accent text-white', card: 'from-accent-soft' },
  amber: { box: 'bg-amber-600 text-white', card: 'from-amber-50' },
}

function StatCard({ label, value, testId, error, icon, tone, className = '' }: { label: string; value: number | null; testId: string; error?: string; icon: IconName; tone: keyof typeof TONES; className?: string }) {
  const t = TONES[tone]
  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-card border border-stone-200 bg-gradient-to-br ${t.card} to-white px-2 py-1.5 shadow-sm sm:px-3 ${className}`} data-testid={testId} title={error || undefined}>
      <span aria-hidden="true" className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm sm:flex ${t.box}`}><Icon name={icon} size={18} /></span>
      <div className="min-w-0 lg:flex lg:items-baseline lg:gap-2">
        <p className="text-lg font-bold leading-tight tabular-nums text-gray-900 sm:text-xl">{value === null ? '—' : formatNumber(value)}</p>
        <p className="text-xs leading-tight text-muted">{label}</p>
      </div>
    </div>
  )
}

export default function PlansPage() {
  const lookups = useLookups()
  const toast = useToast()
  const stats = useMonthStats()
  const { profile } = useProfile()
  const mine = useMyEditRequests(profile?.id)
  const canEdit = (r: PlanRow) => canEditRow(profile, r.created_by, r.created_at) // xóa
  const canUpdate = (r: PlanRow) => canUpdateRow(profile, r.created_by, r.created_at, mine.unlockOf(r.id)) // sửa (D-019: mở khóa theo yêu cầu đã duyệt)
  const list = useListPage<PlanRow>(CFG, fetchPlans, 'transport_plans')
  const { p, update, reload } = list
  const searchRef = useRef<HTMLInputElement>(null)
  const [modal, setModal] = useState<{ plan: PlanRow | null } | null>(null) // null: đóng
  const [deleting, setDeleting] = useState<{ plan: PlanRow; busy: boolean } | null>(null)
  const [requesting, setRequesting] = useState<PlanRow | null>(null)

  const openNew = useCallback(() => setModal({ plan: null }), [])
  const [statsOpen,, toggleStats] = usePersistentToggle('plans:stats')
  const [filtersOpen, setFiltersOpen, toggleFilters] = usePersistentToggle('plans:filters', () => !isSmallScreen())
  const showFilters = useCallback(() => setFiltersOpen(true), [setFiltersOpen])
  useShortcuts(openNew, searchRef, showFilters)

  async function confirmDelete() {
    if (!deleting) return
    setDeleting({ ...deleting, busy: true })
    const { data, error } = await supabase.from('transport_plans').delete().eq('id', deleting.plan.id).select('id')
    const tk = deleting.plan.tk_number
    setDeleting(null)
    if (error) return toast.error(errorMessage(error))
    if (!data?.length) return toast.error(`Bạn không có quyền xóa phiếu ${tk}. ${EDIT_DENIED_HINT}.`) // RLS chặn: 0 dòng bị xóa
    toast.success(`Đã xóa phiếu ${tk}`)
    void reload()
    void stats.reload()
  }

  const columns: Column<PlanRow>[] = [
    {
      key: 'tk', header: 'Số phiếu TK', sort: 'tk_number', nowrap: true,
      render: (r) => (
        <button type="button" onClick={() => setModal({ plan: r })} title={canUpdate(r) ? `Sửa phiếu ${r.tk_number}` : `Xem phiếu ${r.tk_number}`} data-testid={`open-${r.tk_number}`}
          className="rounded font-bold text-primary underline-offset-2 transition-colors duration-150 hover:text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{r.tk_number}</button>
      ),
    },
    { key: 'date', header: 'Ngày xuất', sort: 'export_date', nowrap: true, render: (r) => formatDate(r.export_date) },
    { key: 'order', header: 'Số lệnh VC', sort: 'transport_order_no', render: (r) => r.transport_order_no },
    { key: 'type', header: 'Phân loại VC', render: (r) => <Badge name={r.transport_type?.name} /> },
    { key: 'vehicle', header: 'Số xe', nowrap: true, render: (r) => r.vehicle?.name },
    { key: 'driver', header: 'Tài xế/ phụ xe', render: (r) => r.driver?.name },
    { key: 'fg', header: 'NV xuất TP/BTP', render: (r) => <PersonChip name={r.fg_exporter?.name} /> },
    { key: 'mat', header: 'NV xuất VT', render: (r) => <PersonChips names={sortedMaterials(r).flatMap((m) => (m.lookup?.name ? [m.lookup.name] : []))} /> },
    { key: 'note', header: 'Ghi chú', render: (r) => r.note },
    { key: 'audit', header: 'Người tạo / sửa', nowrap: true, render: (r) => <AuditCell row={r} /> },
    {
      key: 'actions', header: 'Thao tác', nowrap: true,
      render: (r) => {
        const state = canEdit(r) || r.created_by !== profile?.id ? undefined : mine.unlocks.get(r.id) // chỉ người tạo đã quá 24 giờ mới có trạng thái yêu cầu
        const until = mine.unlockOf(r.id)
        const showUntil = !!state && !!until
        return (
          <span className="inline-flex items-center gap-0.5">
            {profile && r.created_by === profile.id && !canEdit(r) && !state && <Button size="sm" onClick={() => setRequesting(r)} data-testid={`request-edit-${r.tk_number}`}>Yêu cầu sửa</Button>}
            {state?.status === 'pending' && <span className={`${PILL} bg-orange-100 text-orange-900`} title="Yêu cầu sửa đang chờ admin duyệt" data-testid={`edit-pending-${r.tk_number}`}>Chờ duyệt</span>}
            {showUntil && <span className={`${PILL} bg-green-100 text-green-900`} title={`Được sửa đến ${untilLabel(until)}`} data-testid={`edit-unlocked-${r.tk_number}`}>Sửa đến {untilLabel(until)}</span>}
            <IconButton icon="edit" label={canUpdate(r) ? `Sửa phiếu ${r.tk_number}${showUntil ? ` (được sửa đến ${untilLabel(until)})` : ''}` : `Xem phiếu ${r.tk_number} (${EDIT_DENIED_HINT})`} onClick={() => setModal({ plan: r })} data-testid={`edit-${r.tk_number}`} />
            <Link to={`/in-thong-ke?tk=${encodeURIComponent(r.tk_number)}`} className={iconButtonClass()} aria-label={`In phiếu ${r.tk_number}`} title={`In phiếu ${r.tk_number}`} data-testid={`print-${r.tk_number}`}>
              <Icon name="print" size={18} />
            </Link>
            <IconButton icon="trash" tone="danger" label={canEdit(r) ? `Xóa phiếu ${r.tk_number}` : `Không xóa được: ${EDIT_DENIED_HINT}`} disabled={!canEdit(r)}
              className="disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent" onClick={() => setDeleting({ plan: r, busy: false })} data-testid={`delete-${r.tk_number}`} />
          </span>
        )
      },
    },
  ]

  const activeCount = countActiveFilters(p)
  const filtered = activeCount > 0
  return (
    <div className="flex flex-col gap-3 md:min-h-0 md:flex-1">
      <PageHeader title="Phiếu thống kê" description="Lập và tra cứu phiếu thống kê vận chuyển">
        <PanelToggle controls="plans-stats" open={statsOpen} onToggle={toggleStats} openLabel="Ẩn số liệu" closedLabel="Hiện số liệu" testId="toggle-stats" />
        <PanelToggle controls="plans-filters" open={filtersOpen} onToggle={toggleFilters} openLabel="Ẩn bộ lọc" closedLabel="Hiện bộ lọc" badge={activeCount} badgeLabel="Bộ lọc" testId="toggle-filters" />
        {!filtersOpen && filtered && <Button size="sm" icon="close" onClick={list.clearFilters} aria-label="Xóa lọc" title="Xóa lọc" data-testid="clear-filters-hidden"><span className="hidden sm:inline">Xóa lọc</span></Button>}
        <Button variant="primary" size="sm" icon="plus" onClick={openNew} title="Thêm phiếu (phím N)" data-testid="add-plan">Thêm phiếu</Button>
      </PageHeader>

      <Collapsible id="plans-stats" open={statsOpen} testId="stats-panel">
      <div role="group" aria-label="Số liệu tháng này" className="grid grid-cols-3 gap-2">
        <StatCard label="Phiếu tháng này" value={stats.plans} icon="file" tone="red" testId="stat-plans" />
        <StatCard label="Dòng bảng kiểm tháng này" value={stats.lines} icon="list" tone="blue" testId="stat-lines" />
        <StatCard label="Tổng khối lượng tháng này (kg)" value={stats.weightKg} error={stats.weightError} icon="scale" tone="amber" testId="stat-weight" />
      </div>
      </Collapsible>

      <Collapsible id="plans-filters" open={filtersOpen} testId="filters-panel">
      <ListToolbar searchRef={searchRef} text={list.text} onText={list.setText} placeholder="Số phiếu TK, số lệnh VC..."
        from={p.from} to={p.to} onFrom={(from) => update({ from })} onTo={(to) => update({ to })}
        active={filtered} onClear={list.clearFilters} />
      </Collapsible>

      <DataTable columns={columns} rows={list.rows} rowKey={(r) => r.id} loading={list.loading} refreshing={list.refreshing}
        error={list.error} onRetry={() => void reload()} sort={p.sort} dir={p.dir} onSort={list.sortBy} testId="plan-table" attached={!list.loading && list.hasData}
        empty={filtered ? (
          <EmptyState title="Không có phiếu nào khớp bộ lọc." hint="Thử đổi từ khóa hoặc khoảng ngày.">
            <Button onClick={list.clearFilters}>Xóa bộ lọc</Button>
          </EmptyState>
        ) : (
          <EmptyState title="Chưa có phiếu nào." hint="Bấm “Thêm phiếu” (hoặc phím N) để nhập phiếu đầu tiên.">
            <Button variant="primary" icon="plus" onClick={openNew}>Thêm phiếu</Button>
          </EmptyState>
        )} />
      {!list.loading && !list.error && list.hasData && (
        <Pagination page={p.page} size={p.size} total={list.total} rowCount={list.rows.length} disabled={list.refreshing}
          onPage={(page) => update({ page })} onSize={(size) => update({ size })} />
      )}

      {modal && (
        <PlanFormModal plan={modal.plan} readOnly={!!modal.plan && !canUpdate(modal.plan)} lookups={lookups} onClose={() => setModal(null)}
          onSaved={(msg) => { setModal(null); toast.success(msg); void reload(); void stats.reload() }} />
      )}
      {requesting && (
        <EditRequestModal planId={requesting.id} label={`phiếu ${requesting.tk_number}`} onClose={() => setRequesting(null)}
          onDone={() => { setRequesting(null); toast.success(`Đã gửi yêu cầu sửa phiếu ${requesting.tk_number}. Chờ admin duyệt.`); void mine.reload() }} />
      )}
      {deleting && (
        <ConfirmDialog title={`Xóa phiếu ${deleting.plan.tk_number}?`} busy={deleting.busy}
          message="Số phiếu này sẽ được cấp lại cho phiếu mới. Không thể hoàn tác."
          onConfirm={() => void confirmDelete()} onCancel={() => setDeleting(null)} />
      )}
    </div>
  )
}

