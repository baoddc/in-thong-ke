import { useCallback, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage, formatDate, formatNumber } from '../lib/format'
import { useLookups } from '../lib/useLookups'
import { countActiveFilters, type ListConfig } from '../lib/listQuery'
import { rpcCount, rpcList } from '../lib/listRpc'
import { useListPage, type Fetcher } from '../lib/useListPage'
import { useShortcuts } from '../lib/useShortcuts'
import { isBelowMd, isSmallScreen, usePersistentToggle } from '../lib/usePersistentToggle'
import { AuditCell } from '../components/AuditInfo'
import type { InlineControls } from '../components/ui/InlineEntryRow'
import InspectionFormModal from '../components/InspectionFormModal'
import InspectionInlineRow from '../components/InspectionInlineRow'
import ListToolbar from '../components/ListToolbar'
import { DraftRows, EditingTag } from '../components/PresenceViews'
import { Badge, PersonChip } from '../components/ui/Badge'
import Button, { IconButton } from '../components/ui/Button'
import { Collapsible, PanelToggle } from '../components/ui/Collapsible'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import DataTable, { type Column } from '../components/ui/DataTable'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import Pagination from '../components/ui/Pagination'
import { useToast } from '../components/ui/Toast'
import { EDIT_DENIED_HINT, canEditRow, canUpdateRow } from '../lib/auth'
import { BLOCKED_MSG, useIncomplete } from '../lib/useIncomplete'
import CopyButton from '../components/ui/CopyButton'
import { targetLabel, untilLabel, useMyEditRequests } from '../lib/useEditRequests'
import { EditRequestModal } from '../components/EditRequestModals'
import { useProfile } from '../lib/useProfile'
import type { InspectionRow } from '../types/inspection'

const CFG: ListConfig = {
  sorts: ['created_at', 'export_date', 'tk_number', 'warehouse_slip_no', 'construction_code', 'construction_name', 'export_type_name', 'product_name', 'quantity', 'total_weight_kg'],
  defaultSort: 'created_at', defaultDir: 'desc', descFirst: ['created_at', 'export_date', 'quantity', 'total_weight_kg'],
  filterCols: {}, defaultToday: true,
}
// Dữ liệu trang qua RPC (không qua view trực tiếp: planning chậm; kèm tên người tạo/sửa — D-017); đếm qua RPC cùng bộ lọc (D-021), chạy song song.
const fetchRows: Fetcher = async (p) => {
  const [rows, count] = await Promise.all([rpcList('list_inspection_details', p), rpcCount('count_inspection_details', p)])
  return { data: rows.data, error: rows.error, count }
}

const DASH = '—' // dòng cũ chưa có số phiếu TK
const PILL = 'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold'

export default function InspectionPage() {
  const lookups = useLookups()
  const toast = useToast()
  const { profile } = useProfile()
  const mine = useMyEditRequests(profile?.id)
  const inc = useIncomplete() // D-029: phiếu/dòng thiếu quá 24h → khóa thao tác khác
  const canEdit = (r: InspectionRow) => canEditRow(profile, r.created_by, r.created_at) // xóa (khi không bị khóa)
  const canDelete = (r: InspectionRow) => canEdit(r) && (!inc.blocked || inc.has('detail', r.id))
  const canUpdate = (r: InspectionRow) => inc.has('detail', r.id) || (!inc.blocked && canUpdateRow(profile, r.created_by, r.created_at, mine.unlockOfLine(r.id, r.plan_id))) // sửa (D-019/D-020: mở theo dòng hoặc theo phiếu)
  const list = useListPage<InspectionRow>(CFG, fetchRows, 'inspection_details')
  const { p, update, reload } = list
  const searchRef = useRef<HTMLInputElement>(null)
  const [modal, setModal] = useState<{ row: InspectionRow | null } | null>(null) // null: đóng
  const [deleting, setDeleting] = useState<{ row: InspectionRow; busy: boolean } | null>(null)
  const [requesting, setRequesting] = useState<InspectionRow | null>(null)

  const [inline, setInline] = useState(false) // dòng nhập trên bảng (D-023)
  const [editingId, setEditingId] = useState<number | null>(null) // dòng đang sửa tại chỗ (D-030); chỉ một dòng, và không cùng lúc với dòng thêm mới
  // ≥ md: thêm bằng dòng nhập đầu bảng; điện thoại: modal như cũ. Dòng nhập dở được giữ nguyên khi đổi trang/lọc/sắp xếp.
  const inlineCtl = useRef<InlineControls | null>(null) // nút Lưu/Hủy trên PageHeader gọi đúng hành động của dòng nhập
  const editCtl = useRef<InlineControls | null>(null) // dòng đang sửa (để hỏi trước khi đóng)
  const [inlineBusy, setInlineBusy] = useState(false)
  const { blocked } = inc
  const openNew = useCallback(() => {
    if (blocked) return toast.error(BLOCKED_MSG)
    if (isBelowMd()) return setModal({ row: null })
    if (editCtl.current && !editCtl.current.cancel()) return // đang sửa dở: hỏi trước khi đóng
    setEditingId(null); setInline(true)
  }, [blocked, toast])
  const [filtersOpen, setFiltersOpen, toggleFilters] = usePersistentToggle('inspection:filters', () => !isSmallScreen())
  const showFilters = useCallback(() => setFiltersOpen(true), [setFiltersOpen])
  useShortcuts(openNew, searchRef, showFilters)

  async function confirmDelete() {
    if (!deleting) return
    setDeleting({ ...deleting, busy: true })
    const { data, error } = await supabase.from('inspection_details').delete().eq('id', deleting.row.id).select('id')
    setDeleting(null)
    if (error) return toast.error(errorMessage(error))
    if (!data?.length) return toast.error(`Bạn không có quyền xóa dòng này. ${EDIT_DENIED_HINT}.`) // RLS chặn: 0 dòng bị xóa
    toast.success('Đã xóa dòng')
    void reload()
  }

  // Sửa tại chỗ (D-030): ≥ md và có quyền sửa → dòng thành ô nhập; ngược lại mở modal (xem / điện thoại).
  function openRow(r: InspectionRow) {
    if (isBelowMd() || !canUpdate(r)) return setModal({ row: r })
    // đóng dòng thêm mới / dòng sửa khác trước — dở dang thì hỏi, không mất dữ liệu đang nhập
    if (inline && inlineCtl.current && !inlineCtl.current.cancel()) return
    if (editingId !== null && editingId !== r.id && editCtl.current && !editCtl.current.cancel()) return
    setInline(false); setEditingId(r.id)
  }
  const editingRow = editingId ? list.rows.find((r) => r.id === editingId) : undefined // đổi trang/lọc làm dòng biến mất = đóng

  const columns: Column<InspectionRow>[] = [
    {
      key: 'actions', header: 'Thao tác', nowrap: true, mobile: 'actions', // cột đầu, dính trái khi cuộn ngang
      render: (r) => {
        const own = !!profile && r.created_by === profile.id && !canEdit(r) && !inc.has('detail', r.id) // người tạo, đã quá 24 giờ (dòng còn thiếu thì sửa thẳng, D-029)
        const until = own ? mine.unlockOfLine(r.id, r.plan_id) : null
        const pending = own && !until && mine.detailUnlocks.get(r.id)?.status === 'pending'
        return (
          <span className="inline-flex items-center gap-0.5">
            {own && !until && !pending && <Button size="sm" onClick={() => setRequesting(r)} data-testid={`request-edit-${r.id}`}>Yêu cầu sửa</Button>}
            {pending && <span className={`${PILL} bg-orange-100 text-orange-900`} title="Yêu cầu sửa đang chờ admin duyệt" data-testid={`edit-pending-${r.id}`}>Chờ duyệt</span>}
            {until && <span className={`${PILL} bg-green-100 text-green-900`} title={`Được sửa đến ${untilLabel(until)}`} data-testid={`edit-unlocked-${r.id}`}>Sửa đến {untilLabel(until)}</span>}
            <IconButton icon="edit" label={canUpdate(r) ? `Sửa dòng${until ? ` (được sửa đến ${untilLabel(until)})` : ''}` : `Xem dòng (${EDIT_DENIED_HINT})`} onClick={() => openRow(r)} data-testid={`edit-${r.id}`} />
            <IconButton icon="trash" tone="danger" label={canDelete(r) ? 'Xóa dòng' : `Không xóa được: ${canEdit(r) ? BLOCKED_MSG : EDIT_DENIED_HINT}`} disabled={!canDelete(r)}
              className="disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent" onClick={() => setDeleting({ row: r, busy: false })} data-testid={`delete-${r.id}`} />
          </span>
        )
      },
    },
    { key: 'date', header: 'Ngày xuất', sort: 'export_date', nowrap: true, render: (r) => formatDate(r.export_date) },
    {
      key: 'tk', header: 'Số phiếu TK', sort: 'tk_number', nowrap: true, mobile: 'title',
      render: (r) => (
        <>
          {r.tk_number ? (
            <button type="button" onClick={() => openRow(r)} title={canUpdate(r) ? 'Sửa dòng này' : 'Xem dòng này'} data-testid={`open-${r.id}`}
              className="rounded font-bold text-primary underline-offset-2 transition-colors duration-150 hover:text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{r.tk_number}</button>
          ) : DASH}
          {r.tk_number && <CopyButton value={r.tk_number} label={`Chép số phiếu ${r.tk_number}`} testId={`copy-${r.id}`} />}
          <EditingTag kind="detail" id={r.id} />
        </>
      ),
    },
    { key: 'order', header: 'Số lệnh VC', nowrap: true, render: (r) => r.transport_order_no },
    { key: 'slip', header: 'Số phiếu xuất kho', sort: 'warehouse_slip_no', nowrap: true, render: (r) => r.warehouse_slip_no },
    { key: 'ccode', header: 'Mã CT', sort: 'construction_code', nowrap: true, render: (r) => r.construction_code },
    { key: 'cname', header: 'Tên công trình', sort: 'construction_name', w: 'min-w-[10rem]', clamp: true, render: (r) => r.construction_name },
    { key: 'item', header: 'Hạng mục', w: 'min-w-[8rem]', clamp: true, render: (r) => r.work_item },
    { key: 'from', header: 'Đơn vị giao hàng', w: 'min-w-[9rem]', clamp: true, render: (r) => r.delivery_unit_name },
    { key: 'to', header: 'Đơn vị nhận hàng', w: 'min-w-[9rem]', clamp: true, render: (r) => r.receiving_unit_name },
    { key: 'etype', header: 'Loại hình xuất', sort: 'export_type_name', nowrap: true, render: (r) => <Badge name={r.export_type_name} /> },
    { key: 'product', header: 'Mặt hàng', sort: 'product_name', nowrap: true, render: (r) => <Badge name={r.product_name} /> },
    { key: 'unit', header: 'ĐVT', nowrap: true, render: (r) => r.unit_name },
    { key: 'qty', header: 'Số lượng xuất (PCS)', sort: 'quantity', numeric: true, render: (r) => formatNumber(r.quantity) },
    { key: 'weight', header: 'Tổng khối lượng (kg)', sort: 'total_weight_kg', numeric: true, render: (r) => formatNumber(r.total_weight_kg) },
    { key: 'shipper', header: 'NV xuất hàng', nowrap: true, render: (r) => <PersonChip name={r.shipper_name} /> },
    { key: 'vehicle', header: 'Số xe', nowrap: true, render: (r) => r.vehicle_name },
    { key: 'driver', header: 'Tên tài xế/ phụ xe', nowrap: true, render: (r) => r.driver_name },
    { key: 'carrier', header: 'Nhà xe', nowrap: true, render: (r) => r.carrier_name },
    { key: 'note', header: 'Ghi chú', w: 'min-w-[16rem]', clamp: true, render: (r) => r.note },
    { key: 'audit', header: 'Người tạo / sửa', nowrap: true, render: (r) => <AuditCell row={r} /> },
  ]

  const clearFilters = list.clearFilters
  const activeCount = countActiveFilters(p)
  const filtered = activeCount > 0
  return (
    <div className="flex flex-col gap-3 md:min-h-0 md:flex-1">
      <PageHeader title="Bảng kiểm chi tiết" description="Từng mặt hàng trên mỗi phiếu xuất kho">
        <PanelToggle controls="inspection-filters" open={filtersOpen} onToggle={toggleFilters} openLabel="Ẩn bộ lọc" closedLabel="Hiện bộ lọc" badge={activeCount} badgeLabel="Bộ lọc" testId="toggle-filters" />
        {!filtersOpen && filtered && <Button size="sm" icon="close" onClick={clearFilters} aria-label="Xóa lọc" title="Xóa lọc" data-testid="clear-filters-hidden"><span className="hidden sm:inline">Xóa lọc</span></Button>}
        <Button variant="primary" size="sm" icon="plus" onClick={openNew} title="Thêm dòng (phím N)" data-testid="add-inspection">Thêm dòng</Button>
        {inline && (
          <>
            <Button variant="primary" size="sm" disabled={inlineBusy} onClick={() => inlineCtl.current?.save()} data-testid="header-save">{inlineBusy ? 'Đang lưu…' : 'Lưu dòng'}</Button>
            <Button size="sm" disabled={inlineBusy} onClick={() => inlineCtl.current?.cancel()} data-testid="header-cancel">Hủy</Button>
          </>
        )}
      </PageHeader>

      <Collapsible id="inspection-filters" open={filtersOpen} testId="filters-panel">
      <ListToolbar searchRef={searchRef} text={list.text} onText={list.setText} placeholder="Tìm trong mọi cột…" searchTitle="Tìm trên mọi cột: số TK, số PXK, lệnh VC, công trình, đơn vị giao/nhận, loại hình xuất, mặt hàng, ĐVT, xe, tài xế, nhà xe, NV xuất, ghi chú, người tạo…"
        from={p.from} to={p.to} onFrom={(from) => update({ from })} onTo={(to) => update({ to })} onRange={(from, to) => update({ from, to })}
        active={filtered} onClear={clearFilters} />
      </Collapsible>

      <DataTable draftRows={<DraftRows table="details" columnKeys={columns.map((c) => c.key)} />} columns={columns} rows={list.rows} rowKey={(r) => r.id} rowTestId={(r) => `row-${r.id}`}
        loading={list.loading} refreshing={list.refreshing} error={list.error} onRetry={() => void reload()}
        sort={p.sort} dir={p.dir} onSort={list.sortBy} testId="inspection-table" attached={!list.loading && list.hasData}
        editRow={editingRow ? {
          key: editingRow.id,
          node: <InspectionInlineRow key={editingRow.id} row={editingRow} columnKeys={columns.map((c) => c.key)} lookups={lookups} controlsRef={editCtl} onCancel={() => setEditingId(null)}
            onSaved={(msg) => { toast.success(msg); setEditingId(null); void reload() }} />,
        } : undefined}
        topRow={inline && (
          <InspectionInlineRow columnKeys={columns.map((c) => c.key)} lookups={lookups} controlsRef={inlineCtl} onBusy={setInlineBusy} onCancel={() => setInline(false)}
            onSaved={(msg) => { toast.success(msg); void reload() }} />
        )}
        empty={filtered ? (
          <EmptyState title="Không có dòng nào khớp bộ lọc." hint="Thử đổi từ khóa, khoảng ngày hoặc bộ lọc.">
            <Button onClick={clearFilters}>Xóa bộ lọc</Button>
          </EmptyState>
        ) : (
          <EmptyState title="Chưa có dòng nào." hint="Bấm “Thêm dòng” (hoặc phím N) để nhập dòng đầu tiên.">
            <Button variant="primary" icon="plus" onClick={openNew}>Thêm dòng</Button>
          </EmptyState>
        )} />
      {!list.loading && !list.error && list.hasData && (
        <Pagination page={p.page} size={p.size} total={list.total} rowCount={list.rows.length} disabled={list.refreshing}
          onPage={(page) => update({ page })} onSize={(size) => update({ size })} />
      )}

      {modal && (
        <InspectionFormModal row={modal.row} readOnly={!!modal.row && !canUpdate(modal.row)} lookups={lookups} onClose={() => setModal(null)}
          onSaved={(msg, keepOpen) => { if (!keepOpen) setModal(null); toast.success(msg); void reload() }} />
      )}
      {requesting && (
        <EditRequestModal detailId={requesting.id} label={targetLabel({ detail: requesting })} onClose={() => setRequesting(null)}
          onDone={() => { setRequesting(null); toast.success(`Đã gửi yêu cầu sửa ${targetLabel({ detail: requesting })}. Chờ admin duyệt.`); void mine.reload() }} />
      )}
      {deleting && (
        <ConfirmDialog title="Xóa dòng bảng kiểm?" busy={deleting.busy}
          message={`Dòng ${deleting.row.product_name ?? ''} của phiếu ${deleting.row.tk_number ?? DASH} sẽ bị xóa. Không thể hoàn tác.`}
          onConfirm={() => void confirmDelete()} onCancel={() => setDeleting(null)} />
      )}
    </div>
  )
}
