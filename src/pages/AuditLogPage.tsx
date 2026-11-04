import { useState } from 'react'
import { useAuditLog, useAuditActors, isLookupKey, type AuditFilters, type AuditRow } from '../lib/useAuditLog'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/format'
import Button from '../components/ui/Button'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/Toast'
import DataTable, { type Column } from '../components/ui/DataTable'
import EmptyState from '../components/ui/EmptyState'
import { Input, Select } from '../components/ui/Input'
import PageHeader from '../components/ui/PageHeader'
import Pagination from '../components/ui/Pagination'

const PILL = 'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold'
const ACTION: Record<string, { label: string; cls: string }> = {
  update: { label: 'Sửa', cls: 'bg-yellow-100 text-yellow-900' },
  delete: { label: 'Xóa', cls: 'bg-danger-soft text-danger' },
  approve: { label: 'Duyệt', cls: 'bg-green-100 text-green-900' },
  reject: { label: 'Từ chối', cls: 'bg-gray-200 text-gray-800' },
  archive: { label: 'Ẩn', cls: 'bg-orange-100 text-orange-900' },
  insert: { label: 'Thêm', cls: 'bg-blue-100 text-blue-900' },
  restore: { label: 'Khôi phục', cls: 'bg-purple-100 text-purple-900' },
}
const RESTORABLE_ACTION = new Set(['update', 'delete', 'archive'])
const RESTORABLE_TABLE = new Set(['transport_plans', 'inspection_details', 'lookup_items'])
const RESTORE_HINT: Record<string, string> = {
  update: 'Trả các ô về giá trị cũ.',
  delete: 'Tạo lại dữ liệu đã xóa.',
  archive: 'Hiện lại mục danh mục.',
}
const TABLE: Record<string, string> = {
  transport_plans: 'Phiếu',
  inspection_details: 'Dòng bảng kiểm',
  transport_plan_material_exporters: 'NV xuất VT của phiếu',
  lookup_items: 'Danh mục',
  edit_requests: 'Yêu cầu sửa',
}
const COLUMN: Record<string, string> = {
  export_date: 'Ngày xuất', transport_order_no: 'Số lệnh VC', transport_type_id: 'Phân loại VC', vehicle_id: 'Số xe', driver_id: 'Tài xế',
  fg_exporter_id: 'NV xuất TP/BTP', note: 'Ghi chú', warehouse_slip_no: 'Số PXK', construction_id: 'Công trình', work_item: 'Hạng mục',
  delivery_unit_id: 'Đơn vị giao', receiving_unit_id: 'Đơn vị nhận', export_type_id: 'Loại hình xuất', product_id: 'Mặt hàng', unit_id: 'ĐVT',
  quantity: 'Số lượng', total_weight_kg: 'Khối lượng (kg)', carrier_id: 'Nhà xe', shipper_id: 'NV xuất hàng', plan_id: 'Số phiếu TK',
  name: 'Tên', code: 'Mã', status: 'Trạng thái', decision_note: 'Ghi chú duyệt', unlock_until: 'Mở khóa đến', archived_at: 'Ẩn lúc', lookup_id: 'Người',
  material_exporters: 'NV xuất VT', // migration 000025: [tên cũ[], tên mới[]]
}
const SKIP = new Set(['id', 'created_at', 'updated_at', 'created_by', 'updated_by'])
const FOLD_OVER = 4 // quá số dòng này thì gập lại cho gọn

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
/** ISO -> "04/11/2026 14:05:09" (giờ VN). */
function formatFull(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]))
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`
}

function Changes({ row, names }: { row: AuditRow; names: Map<number, string> }) {
  const show = (k: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '(trống)'
    if (isLookupKey(k) && typeof v === 'number') return names.get(v) ?? `#${v}`
    if (/_(at|until)$/.test(k) && typeof v === 'string') return formatFull(v) || v
    if (Array.isArray(v)) return v.length ? v.join(', ') : '(trống)' // danh sách tên NV xuất VT
    return typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  const changes = row.changes && typeof row.changes === 'object' && !Array.isArray(row.changes) ? row.changes : {}
  if (row.action === 'restore') return <span data-testid={`changes-${row.id}`}>Khôi phục từ nhật ký #{String(changes.from_log ?? '')}</span>
  const diff = row.action === 'update' || row.action === 'approve' || row.action === 'reject'
  const entries = Object.entries(changes).filter(([k, v]) => !SKIP.has(k) && (diff || (v !== null && v !== '')))
  if (entries.length === 0) return null
  const list = (
    <ul className="space-y-0.5">
      {entries.map(([k, v]) => (
        <li key={k}>
          <span className="font-medium">{COLUMN[k] ?? k}:</span>{' '}
          {diff && Array.isArray(v)
            ? <><span className="text-danger">{show(k, v[0])}</span> → <span className="text-green-800">{show(k, v[1])}</span></>
            : show(k, v)}
        </li>
      ))}
    </ul>
  )
  if (diff && entries.length <= FOLD_OVER) return <div className="min-w-56 max-w-md break-words" data-testid={`changes-${row.id}`}>{list}</div>
  return (
    <details className="min-w-56 max-w-md break-words" data-testid={`changes-${row.id}`}>
      <summary className="cursor-pointer py-2 text-primary sm:py-0">{row.action === 'delete' ? 'Xem dữ liệu đã xóa' : `Xem chi tiết (${entries.length})`}</summary>
      {list}
    </details>
  )
}

const EMPTY: AuditFilters = { from: '', to: '', actor: '', action: '', table: '' }

export default function AuditLogPage() {
  const [filters, setFilters] = useState(EMPTY)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(50)
  const list = useAuditLog(filters, page, size)
  const set = (k: keyof AuditFilters) => (v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1) }
  const actors = useAuditActors()
  const toast = useToast()
  const [target, setTarget] = useState<AuditRow | null>(null)
  const [busy, setBusy] = useState(false)
  const restore = async () => {
    if (!target) return
    setBusy(true)
    const { data, error } = await supabase.rpc('restore_audit', { p_id: target.id })
    setBusy(false)
    setTarget(null)
    if (error) return toast.error(errorMessage(error))
    toast.success(data)
    void list.reload()
  }

  const columns: Column<AuditRow>[] = [
    { key: 'at', header: 'Thời gian', nowrap: true, render: (r) => formatFull(r.at) },
    { key: 'actor', header: 'Người', render: (r) => <>{r.actor_name} <span className={`${PILL} ${r.actor_role === 'root' ? 'bg-amber-400 text-slate-900' : 'bg-stone-200 text-stone-800'}`}>{r.actor_role === 'root' ? 'Root' : 'Admin'}</span></> },
    { key: 'action', header: 'Hành động', render: (r) => { const a = ACTION[r.action]; return <span className={`${PILL} ${a?.cls ?? 'bg-stone-200 text-stone-800'}`}>{a?.label ?? r.action}</span> } },
    { key: 'table', header: 'Đối tượng', nowrap: true, render: (r) => TABLE[r.table_name] ?? r.table_name },
    { key: 'label', header: 'Bản ghi', render: (r) => <span className="font-medium">{r.label ?? (r.row_id ? `#${r.row_id}` : '')}</span> },
    { key: 'changes', header: 'Chi tiết', render: (r) => <Changes row={r} names={list.names} /> },
    { key: 'restore', header: 'Khôi phục', render: (r) => {
      if (r.restored_at) return <span className="text-sm text-purple-900" data-testid={`restored-${r.id}`}>Đã khôi phục · {r.restored_by_name} · {formatFull(r.restored_at)}</span>
      if (!RESTORABLE_ACTION.has(r.action) || !RESTORABLE_TABLE.has(r.table_name)) return null
      return <Button size="sm" onClick={() => setTarget(r)} data-testid={`restore-${r.id}`}>Khôi phục</Button>
    } },
  ]

  return (
    <div className="flex flex-col gap-3 md:min-h-0 md:flex-1">
      <PageHeader title="Lịch sử thao tác" description="Nhật ký sửa, duyệt sửa, xóa của admin — chỉ root xem được" />
      <div className="grid grid-cols-2 gap-x-2 gap-y-2 sm:gap-3 lg:grid-cols-5" role="search" aria-label="Bộ lọc nhật ký">
        <label className="min-w-0 text-sm font-medium">Từ ngày<Input type="date" value={filters.from} onChange={(e) => set('from')(e.target.value)} data-testid="filter-from" /></label>
        <label className="min-w-0 text-sm font-medium">Đến ngày<Input type="date" value={filters.to} onChange={(e) => set('to')(e.target.value)} data-testid="filter-to" /></label>
        <label className="col-span-2 min-w-0 text-sm font-medium lg:col-span-1">Người thao tác<Select value={filters.actor} onChange={(e) => set('actor')(e.target.value)} data-testid="filter-actor">
          <option value="">Tất cả</option>
          {actors.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </Select></label>
        <label className="min-w-0 text-sm font-medium">Hành động
          <Select value={filters.action} onChange={(e) => set('action')(e.target.value)} data-testid="filter-action">
            <option value="">Tất cả</option>
            {Object.entries(ACTION).map(([v, a]) => <option key={v} value={v}>{a.label}</option>)}
          </Select>
        </label>
        <label className="min-w-0 text-sm font-medium">Đối tượng
          <Select value={filters.table} onChange={(e) => set('table')(e.target.value)} data-testid="filter-table">
            <option value="">Tất cả</option>
            {Object.entries(TABLE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </label>
      </div>

      <DataTable columns={columns} rows={list.rows} rowKey={(r) => r.id} rowTestId={(r) => `audit-row-${r.id}`}
        loading={list.loading} error={list.error} onRetry={() => void list.reload()} sort="" dir="asc" onSort={() => {}} testId="audit-table" attached={!list.loading && list.rows.length > 0}
        empty={<EmptyState title="Chưa có thao tác nào được ghi lại." />} />
      {!list.loading && !list.error && list.rows.length > 0 && (
        <Pagination page={page} size={size} total={list.total} rowCount={list.rows.length} onPage={setPage} onSize={(s) => { setSize(s); setPage(1) }} />
      )}
      {target && (
        <ConfirmDialog title="Khôi phục dữ liệu" confirmLabel="Khôi phục" busy={busy} onConfirm={() => void restore()} onCancel={() => setTarget(null)}
          message={`${RESTORE_HINT[target.action]} Bản ghi: ${target.label ?? `#${target.row_id}`}. Bạn có chắc chắn không?`} />
      )}
    </div>
  )
}
