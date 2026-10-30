import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/format'
import { KINDS, useLookups, type LookupItem } from '../lib/useLookups'
import { forgetLookups, isBigKind } from '../lib/lookupSearch'
import { DEFAULT_SIZE, pageRange, sanitizeTerm } from '../lib/listQuery'
import Button, { IconButton } from '../components/ui/Button'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import PageHeader from '../components/ui/PageHeader'
import Pagination from '../components/ui/Pagination'
import { useToast } from '../components/ui/Toast'

// Nhóm tab theo vị trí: từ 'construction' trở đi thuộc "Bảng kiểm chi tiết".
const SPLIT = KINDS.findIndex((k) => k.kind === 'construction')
const TAB_GROUPS = [
  { label: 'Phiếu thống kê', kinds: KINDS.slice(0, SPLIT) },
  { label: 'Bảng kiểm chi tiết', kinds: KINDS.slice(SPLIT) },
]

/** Danh mục lớn (D-012): tìm theo tên/mã + phân trang phía server, không tải hết. */
function useBigLookups(kind: string, q: string, page: number, size: number) {
  const [state, setState] = useState<{ kind: string | null; key: string; rows: LookupItem[]; total: number; error: string }>({ kind: null, key: '', rows: [], total: 0, error: '' })
  const [attempt, setAttempt] = useState(0)
  const key = `${kind}|${q}|${page}|${size}|${attempt}`
  useEffect(() => {
    if (!isBigKind(kind)) return
    let alive = true
    const t = setTimeout(async () => {
      let qb = supabase.from('lookup_items').select('*', { count: 'estimated' }).eq('kind', kind)
      const term = sanitizeTerm(q)
      if (term) qb = qb.or(`name.ilike.%${term}%,code.ilike.%${term}%`)
      const [a, b] = pageRange(page, size)
      const r = await qb.order('name').order('id').range(a, b)
      if (!alive) return
      setState({ kind, key, rows: r.data ?? [], total: r.count ?? r.data?.length ?? 0, error: r.error ? errorMessage(r.error) : '' })
    }, q ? 250 : 0)
    return () => { alive = false; clearTimeout(t) }
  }, [kind, q, page, size, attempt, key])
  return { rows: state.rows, total: state.total, error: state.error, loading: state.kind !== kind, refreshing: state.key !== key, reload: () => setAttempt((n) => n + 1) }
}

export default function LookupsPage() {
  const { byKind, loading, error: loadError, reload } = useLookups()
  const toast = useToast()
  const [kind, setKind] = useState<string>(KINDS[0].kind)
  const [name, setName] = useState('')
  const [filter, setFilter] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [code, setCode] = useState('') // Mã CT, chỉ dùng ở tab Công trình
  const [editCode, setEditCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<LookupItem | null>(null)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState<number>(DEFAULT_SIZE)
  const isCons = kind === 'construction'
  const big = isBigKind(kind)
  const bigList = useBigLookups(kind, filter.trim(), page, size)

  async function run(fn: () => PromiseLike<{ error: { code?: string; message?: string } | null }>) {
    setBusy(true)
    setMsg('')
    const { error } = await fn()
    setBusy(false)
    if (error) { setMsg(errorMessage(error)); return false }
    forgetLookups()
    await reload()
    bigList.reload()
    return true
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return setMsg('Vui lòng nhập tên.')
    const row = { kind, name: n, code: isCons ? code.trim() || null : null }
    if (await run(() => supabase.from('lookup_items').insert(row))) { setName(''); setCode(''); toast.success(`Đã thêm "${n}"`) }
  }

  async function save(item: LookupItem) {
    const n = editName.trim()
    if (!n) return setMsg('Vui lòng nhập tên.')
    const patch = isCons ? { name: n, code: editCode.trim() || null } : { name: n }
    if (await run(() => supabase.from('lookup_items').update(patch).eq('id', item.id))) { setEditId(null); toast.success('Đã cập nhật mục') }
  }

  async function confirmDelete() {
    if (!deleting) return
    const item = deleting
    setDeleting(null)
    if (await run(() => supabase.from('lookup_items').delete().eq('id', item.id))) toast.success(`Đã xóa "${item.name}"`)
  }

  const q = filter.trim().toLowerCase()
  const list = big ? bigList.rows : byKind(kind).filter((i) => `${i.code ?? ''} ${i.name}`.toLowerCase().includes(q))
  return (
    <div className="space-y-3">
      <PageHeader title="Danh mục" description="Các lựa chọn dùng trong phiếu và bảng kiểm" />
      <div className="space-y-3 rounded-card border border-stone-200 bg-white p-3 shadow-card">
        {TAB_GROUPS.map((g) => (
          <div key={g.label} className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</p>
            <div className="flex flex-wrap gap-1.5 text-sm" role="tablist" aria-label={g.label}>
              {g.kinds.map((k) => (
                <button key={k.kind} role="tab" aria-selected={kind === k.kind} data-testid={`tab-${k.kind}`}
                  onClick={() => { setKind(k.kind); setFilter(''); setPage(1); setMsg(''); setEditId(null); setCode('') }}
                  className={`min-h-10 rounded-full border px-3 py-2 font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${kind === k.kind ? 'border-primary bg-primary text-white shadow-sm' : 'border-line bg-white text-gray-800 hover:border-primary-line hover:bg-primary-soft'}`}>{k.label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="flex gap-2">
        {isCons && <Input aria-label="Mã công trình mới" placeholder="Mã CT" value={code} onChange={(e) => setCode(e.target.value)} className="!mt-0 !w-28 min-w-0" data-testid="lookup-new-code" />}
        <Input aria-label="Tên mục mới" placeholder="Nhập tên mục mới" value={name} onChange={(e) => setName(e.target.value)} className="!mt-0 flex-1 min-w-0" data-testid="lookup-new-name" />
        <Button type="submit" variant="primary" icon="plus" disabled={busy} data-testid="lookup-add">Thêm</Button>
      </form>
      <Input type="search" aria-label="Lọc theo tên" placeholder="Lọc theo tên..." value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1) }} className="!mt-0" data-testid="lookup-filter" />
      {(msg || (big ? bigList.error : loadError)) && <p role="alert" className="rounded-card border border-danger-line bg-danger-soft p-2 text-danger" data-testid="lookup-error">{msg || (big ? bigList.error : loadError)}</p>}
      {(big ? bigList.loading : loading) ? (
        <div className="space-y-2" aria-busy="true" data-testid="lookup-loading">
          {[0, 1, 2, 3, 4].map((n) => <div key={n} className="h-10 animate-pulse rounded-card bg-stone-200" />)}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-card border border-stone-200 bg-white p-6 text-center shadow-card">
          <EmptyState title={q ? 'Không có mục nào khớp.' : 'Chưa có mục nào.'} hint={q ? undefined : 'Nhập tên ở ô phía trên rồi bấm “Thêm”.'} />
        </div>
      ) : (
        <ul className={`divide-y divide-stone-100 overflow-hidden rounded-card border border-stone-200 bg-white shadow-card ${big && bigList.refreshing ? 'opacity-60' : ''}`} data-testid="lookup-list">
          {list.map((it) => (
            <li key={it.id} className="flex items-center gap-2 p-2 transition-colors duration-150 even:bg-stone-50 hover:bg-primary-soft">
              {editId === it.id ? (
                <>
                  {isCons && <Input aria-label="Mã công trình" placeholder="Mã CT" value={editCode} onChange={(e) => setEditCode(e.target.value)} className="!mt-0 !w-24 min-w-0" data-testid="lookup-edit-code" />}
                  <Input aria-label="Tên mục" value={editName} onChange={(e) => setEditName(e.target.value)} className="!mt-0 flex-1 min-w-0" />
                  <Button size="sm" variant="primary" disabled={busy} onClick={() => save(it)}>Lưu</Button>
                  <Button size="sm" onClick={() => setEditId(null)}>Hủy</Button>
                </>
              ) : (
                <>
                  {isCons && <span className="w-24 shrink-0 font-medium break-words" data-testid="lookup-code">{it.code}</span>}
                  <span className="flex-1 break-words">{it.name}</span>
                  <IconButton icon="edit" label={`Sửa ${it.name}`} onClick={() => { setEditId(it.id); setEditName(it.name); setEditCode(it.code ?? '') }} />
                  <IconButton icon="trash" tone="danger" label={`Xóa ${it.name}`} disabled={busy} onClick={() => setDeleting(it)} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {big && !bigList.loading && !bigList.error && bigList.total > 0 && (
        <Pagination page={page} size={size} total={bigList.total} disabled={bigList.refreshing} onPage={setPage} onSize={(n) => { setSize(n); setPage(1) }} />
      )}
      {deleting && (
        <ConfirmDialog title={`Xóa "${deleting.name}"?`} message="Mục sẽ bị xóa khỏi danh mục. Nếu đang được dùng trong phiếu thì không xóa được."
          onConfirm={() => void confirmDelete()} onCancel={() => setDeleting(null)} />
      )}
    </div>
  )
}
