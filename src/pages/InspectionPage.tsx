import { useCallback, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage, formatDate, formatNumber } from '../lib/format'
import { useLookups } from '../lib/useLookups'
import { applyFilters, applyList, countActiveFilters, type ListConfig } from '../lib/listQuery'
import { useListPage, type Fetcher } from '../lib/useListPage'
import { useShortcuts } from '../lib/useShortcuts'
import { isSmallScreen, usePersistentToggle } from '../lib/usePersistentToggle'
import LookupCombobox from '../components/LookupCombobox'
import InspectionFormModal from '../components/InspectionFormModal'
import ListToolbar from '../components/ListToolbar'
import { Badge, PersonChip } from '../components/ui/Badge'
import Button, { IconButton } from '../components/ui/Button'
import { Collapsible, PanelToggle } from '../components/ui/Collapsible'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import DataTable, { type Column } from '../components/ui/DataTable'
import EmptyState from '../components/ui/EmptyState'
import { Field, Select } from '../components/ui/Input'
import PageHeader from '../components/ui/PageHeader'
import Pagination from '../components/ui/Pagination'
import { useToast } from '../components/ui/Toast'
import { EDIT_DENIED_HINT, canEditRow } from '../lib/auth'
import { useProfile } from '../lib/useProfile'
import type { InspectionRow } from '../types/inspection'

const CFG: ListConfig = {
  sorts: ['created_at', 'export_date', 'tk_number', 'warehouse_slip_no', 'construction_code', 'construction_name', 'export_type_name', 'product_name', 'quantity', 'total_weight_kg'],
  defaultSort: 'created_at', defaultDir: 'desc', descFirst: ['created_at', 'export_date', 'quantity', 'total_weight_kg'],
  searchCols: ['tk_number', 'warehouse_slip_no'], // chỉ cột có index trigram (D-012)
  dateCol: 'export_date', filterCols: { type: 'export_type_id', product: 'product_id', cons: 'construction_id', recv: 'receiving_unit_id' }, tiebreak: 'id',
}
// Dữ liệu từ view (không đếm: đếm qua view chậm do lateral join); đếm chính xác riêng trên bảng gốc, cùng bộ lọc, chạy song song.
const fetchRows: Fetcher = async (p) => {
  const [rows, cnt] = await Promise.all([
    applyList(supabase.from('inspection_details_view').select('*'), p, CFG),
    applyFilters(supabase.from('inspection_details').select('id', { count: 'exact', head: true }), p, CFG),
  ])
  return { data: rows.data, error: rows.error, count: cnt.error ? null : cnt.count }
}

const DASH = '—' // dòng cũ chưa có số phiếu TK

export default function InspectionPage() {
  const lookups = useLookups()
  const toast = useToast()
  const { profile } = useProfile()
  const canEdit = (r: InspectionRow) => canEditRow(profile, r.created_by, r.created_at)
  const list = useListPage<InspectionRow>(CFG, fetchRows)
  const { p, update, reload } = list
  const searchRef = useRef<HTMLInputElement>(null)
  const [modal, setModal] = useState<{ row: InspectionRow | null } | null>(null) // null: đóng
  const [deleting, setDeleting] = useState<{ row: InspectionRow; busy: boolean } | null>(null)

  const openNew = useCallback(() => setModal({ row: null }), [])
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

  const columns: Column<InspectionRow>[] = [
    { key: 'date', header: 'Ngày xuất', sort: 'export_date', nowrap: true, render: (r) => formatDate(r.export_date) },
    {
      key: 'tk', header: 'Số phiếu TK', sort: 'tk_number', nowrap: true,
      render: (r) => (r.tk_number ? (
        <button type="button" onClick={() => setModal({ row: r })} title={canEdit(r) ? 'Sửa dòng này' : 'Xem dòng này'} data-testid={`open-${r.id}`}
          className="rounded font-bold text-primary underline-offset-2 transition-colors duration-150 hover:text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{r.tk_number}</button>
      ) : DASH),
    },
    { key: 'order', header: 'Số lệnh VC', render: (r) => r.transport_order_no },
    { key: 'slip', header: 'Số phiếu xuất kho', sort: 'warehouse_slip_no', render: (r) => r.warehouse_slip_no },
    { key: 'ccode', header: 'Mã CT', sort: 'construction_code', nowrap: true, render: (r) => r.construction_code },
    { key: 'cname', header: 'Tên công trình', sort: 'construction_name', render: (r) => r.construction_name },
    { key: 'item', header: 'Hạng mục', render: (r) => r.work_item },
    { key: 'from', header: 'Đơn vị giao hàng', render: (r) => r.delivery_unit_name },
    { key: 'to', header: 'Đơn vị nhận hàng', render: (r) => r.receiving_unit_name },
    { key: 'etype', header: 'Loại hình xuất', sort: 'export_type_name', render: (r) => <Badge name={r.export_type_name} /> },
    { key: 'product', header: 'Mặt hàng', sort: 'product_name', render: (r) => <Badge name={r.product_name} /> },
    { key: 'unit', header: 'ĐVT', render: (r) => r.unit_name },
    { key: 'qty', header: 'Số lượng xuất (PCS)', sort: 'quantity', numeric: true, render: (r) => formatNumber(r.quantity) },
    { key: 'weight', header: 'Tổng khối lượng (kg)', sort: 'total_weight_kg', numeric: true, render: (r) => formatNumber(r.total_weight_kg) },
    { key: 'shipper', header: 'NV xuất hàng', render: (r) => <PersonChip name={r.shipper_name} /> },
    { key: 'vehicle', header: 'Số xe', nowrap: true, render: (r) => r.vehicle_name },
    { key: 'driver', header: 'Tên tài xế/ phụ xe', render: (r) => r.driver_name },
    { key: 'carrier', header: 'Nhà xe', render: (r) => r.carrier_name },
    { key: 'note', header: 'Ghi chú', render: (r) => r.note },
    {
      key: 'actions', header: 'Thao tác', nowrap: true,
      render: (r) => (
        <span className="inline-flex gap-0.5">
          <IconButton icon="edit" label={canEdit(r) ? 'Sửa dòng' : `Xem dòng (${EDIT_DENIED_HINT})`} onClick={() => setModal({ row: r })} data-testid={`edit-${r.id}`} />
          <IconButton icon="trash" tone="danger" label={canEdit(r) ? 'Xóa dòng' : `Không xóa được: ${EDIT_DENIED_HINT}`} disabled={!canEdit(r)}
            className="disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent" onClick={() => setDeleting({ row: r, busy: false })} data-testid={`delete-${r.id}`} />
        </span>
      ),
    },
  ]

  const setFilter = (key: string, value: string) => update({ filters: { ...p.filters, [key]: value } })
  const [clearTick, setClearTick] = useState(0) // ô Công trình/Đơn vị nhận gõ sẵn chữ → khởi tạo lại khi xóa bộ lọc
  const clearFilters = () => { list.clearFilters(); setClearTick((t) => t + 1) }
  const serverFilter = (label: string, kind: string, key: string, testId: string) => (
    <div className="col-span-2 sm:col-span-1 sm:w-44">
      <LookupCombobox key={`${key}-${clearTick}`} inputSize="sm" label={label} kind={kind} server allowAdd={false}
        selectedIds={p.filters[key] ? [Number(p.filters[key])] : []} onChange={(ids) => { const v = ids[0] ? String(ids[0]) : ''; if (v !== p.filters[key]) setFilter(key, v) }} testId={testId} />
    </div>
  )
  const activeCount = countActiveFilters(p)
  const filtered = activeCount > 0
  return (
    <div className="flex flex-col gap-3 md:min-h-0 md:flex-1">
      <PageHeader title="Bảng kiểm chi tiết" description="Từng mặt hàng trên mỗi phiếu xuất kho">
        <PanelToggle controls="inspection-filters" open={filtersOpen} onToggle={toggleFilters} openLabel="Ẩn bộ lọc" closedLabel="Hiện bộ lọc" badge={activeCount} badgeLabel="Bộ lọc" testId="toggle-filters" />
        {!filtersOpen && filtered && <Button size="sm" icon="close" onClick={clearFilters} aria-label="Xóa lọc" title="Xóa lọc" data-testid="clear-filters-hidden"><span className="hidden sm:inline">Xóa lọc</span></Button>}
        <Button variant="primary" size="sm" icon="plus" onClick={openNew} title="Thêm dòng (phím N)" data-testid="add-inspection">Thêm dòng</Button>
      </PageHeader>

      <Collapsible id="inspection-filters" open={filtersOpen} testId="filters-panel">
      <ListToolbar searchRef={searchRef} text={list.text} onText={list.setText} placeholder="Số TK, số phiếu xuất kho..."
        from={p.from} to={p.to} onFrom={(from) => update({ from })} onTo={(to) => update({ to })}
        active={filtered} onClear={clearFilters}>
        <Field compact label="Loại hình xuất" className="col-span-2 sm:col-span-1 sm:w-44">
          <Select inputSize="sm" value={p.filters.type} onChange={(e) => setFilter('type', e.target.value)} data-testid="filter-type">
            <option value="">Tất cả</option>
            {lookups.byKind('export_type').map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        </Field>
        <Field compact label="Mặt hàng" className="col-span-2 sm:col-span-1 sm:w-44">
          <Select inputSize="sm" value={p.filters.product} onChange={(e) => setFilter('product', e.target.value)} data-testid="filter-product">
            <option value="">Tất cả</option>
            {lookups.byKind('product').map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        </Field>
        {serverFilter('Công trình', 'construction', 'cons', 'filter-construction')}
        {serverFilter('Đơn vị nhận', 'receiving_unit', 'recv', 'filter-receiving')}
      </ListToolbar>
      </Collapsible>

      <DataTable columns={columns} rows={list.rows} rowKey={(r) => r.id} rowTestId={(r) => `row-${r.id}`}
        loading={list.loading} refreshing={list.refreshing} error={list.error} onRetry={() => void reload()}
        sort={p.sort} dir={p.dir} onSort={list.sortBy} testId="inspection-table" attached={!list.loading && list.hasData}
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
        <InspectionFormModal row={modal.row} readOnly={!!modal.row && !canEdit(modal.row)} lookups={lookups} onClose={() => setModal(null)}
          onSaved={(msg, keepOpen) => { if (!keepOpen) setModal(null); toast.success(msg); void reload() }} />
      )}
      {deleting && (
        <ConfirmDialog title="Xóa dòng bảng kiểm?" busy={deleting.busy}
          message={`Dòng ${deleting.row.product_name ?? ''} của phiếu ${deleting.row.tk_number ?? DASH} sẽ bị xóa. Không thể hoàn tác.`}
          onConfirm={() => void confirmDelete()} onCancel={() => setDeleting(null)} />
      )}
    </div>
  )
}
