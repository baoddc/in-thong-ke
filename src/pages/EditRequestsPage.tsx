import { useState } from 'react'
import { formatDate, formatDateTime } from '../lib/format'
import { targetLabel, useEditRequestList, type EditRequest, type EditStatus } from '../lib/useEditRequests'
import { DecideModal } from '../components/EditRequestModals'
import Button from '../components/ui/Button'
import DataTable, { type Column } from '../components/ui/DataTable'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import Pagination from '../components/ui/Pagination'
import { useToast } from '../components/ui/Toast'

const PILL = 'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold'
const STATUS: Record<EditStatus, { label: string; cls: string }> = {
  pending: { label: 'Chờ duyệt', cls: 'bg-orange-100 text-orange-900' },
  approved: { label: 'Đã duyệt', cls: 'bg-green-100 text-green-900' },
  rejected: { label: 'Từ chối', cls: 'bg-danger-soft text-danger' },
}
const FILTERS: { value: EditStatus | ''; label: string }[] = [
  { value: 'pending', label: 'Chờ duyệt' }, { value: 'approved', label: 'Đã duyệt' }, { value: 'rejected', label: 'Từ chối' }, { value: '', label: 'Tất cả' },
]

export default function EditRequestsPage() {
  const toast = useToast()
  const [status, setStatus] = useState<EditStatus | ''>('pending')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(50)
  const list = useEditRequestList(status, page, size)
  const [deciding, setDeciding] = useState<{ req: EditRequest; approve: boolean } | null>(null)

  const columns: Column<EditRequest>[] = [
    {
      key: 'kind', header: 'Loại', nowrap: true,
      render: (r) => <span className={`${PILL} ${r.detail_id ? 'bg-blue-100 text-blue-900' : 'bg-stone-200 text-stone-800'}`} data-testid={`kind-${r.id}`}>{r.detail_id ? 'Dòng bảng kiểm' : 'Phiếu'}</span>,
    },
    {
      key: 'tk', header: 'Số phiếu TK', nowrap: true,
      render: (r) => r.detail ? (
        <>
          <span className="font-bold">{r.detail.tk_number ?? '—'}</span>
          <span className="block text-xs text-muted">{[r.detail.warehouse_slip_no && `PXK ${r.detail.warehouse_slip_no}`, formatDate(r.detail.export_date)].filter(Boolean).join(' · ')}</span>
        </>
      ) : <span className="font-bold">{r.plan?.tk_number ?? '—'}</span>,
    },
    { key: 'by', header: 'Người yêu cầu', render: (r) => r.requester_name },
    { key: 'reason', header: 'Lý do', render: (r) => <span className="block min-w-48 max-w-sm whitespace-pre-wrap break-words">{r.reason}</span> },
    { key: 'at', header: 'Gửi lúc', nowrap: true, render: (r) => formatDateTime(r.created_at) },
    { key: 'status', header: 'Trạng thái', render: (r) => <span className={`${PILL} ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span> },
    {
      key: 'decision', header: 'Người duyệt',
      render: (r) => r.status === 'pending' ? '' : (
        <span className="block min-w-40 whitespace-pre-wrap break-words">
          {r.decider_name}{r.decided_at ? ` · ${formatDateTime(r.decided_at)}` : ''}
          {r.decision_note && <span className="block text-muted">{r.decision_note}</span>}
        </span>
      ),
    },
    { key: 'until', header: 'Mở đến', nowrap: true, render: (r) => (r.status === 'approved' ? formatDateTime(r.unlock_until) : '') },
    {
      key: 'actions', header: 'Thao tác', nowrap: true,
      render: (r) => r.status === 'pending' && (
        <span className="inline-flex gap-1">
          <Button size="sm" variant="primary" className="!bg-green-700 hover:!bg-green-800" onClick={() => setDeciding({ req: r, approve: true })} data-testid={`approve-${r.id}`}>Duyệt</Button>
          <Button size="sm" variant="danger" onClick={() => setDeciding({ req: r, approve: false })} data-testid={`reject-${r.id}`}>Từ chối</Button>
        </span>
      ),
    },
  ]

  const pick = (s: EditStatus | '') => { setStatus(s); setPage(1) }
  return (
    <div className="flex flex-col gap-3 md:min-h-0 md:flex-1">
      <PageHeader title="Yêu cầu sửa" description="Duyệt yêu cầu sửa phiếu hoặc dòng bảng kiểm đã quá 24 giờ" />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo trạng thái">
        {FILTERS.map((f) => (
          <Button key={f.value} size="sm" aria-pressed={status === f.value} className={status === f.value ? 'ring-2 ring-primary' : ''} onClick={() => pick(f.value)} data-testid={`filter-${f.value || 'all'}`}>{f.label}</Button>
        ))}
      </div>

      <DataTable columns={columns} rows={list.rows} rowKey={(r) => r.id} rowTestId={(r) => `request-row-${r.id}`}
        loading={list.loading} error={list.error} onRetry={() => void list.reload()} sort="" dir="asc" onSort={() => {}} testId="request-table" attached={!list.loading && list.rows.length > 0}
        empty={<EmptyState title={status === 'pending' ? 'Không có yêu cầu nào chờ duyệt.' : 'Không có yêu cầu nào.'} />} />
      {!list.loading && !list.error && list.rows.length > 0 && (
        <Pagination page={page} size={size} total={list.total} rowCount={list.rows.length} onPage={setPage} onSize={(s) => { setSize(s); setPage(1) }} />
      )}

      {deciding && (
        <DecideModal id={deciding.req.id} label={targetLabel(deciding.req)} line={!!deciding.req.detail_id} approve={deciding.approve} onClose={() => setDeciding(null)}
          onDone={() => { toast.success(deciding.approve ? 'Đã duyệt yêu cầu sửa' : 'Đã từ chối yêu cầu sửa'); setDeciding(null); void list.reload() }} />
      )}
    </div>
  )
}
