import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/format'
import { filterSuggestions, findIdByName, hasExactMatch } from '../lib/lookupMatch'
import { recall, remember, resolveFn, searchFn, useRemoteOptions, type Opt } from '../lib/lookupSearch'
import { inputClass, labelClass } from './ui/Input'

type Item = Opt

type Props = {
  label: string
  kind: string
  items?: Item[] // chế độ thường: các mục thuộc `kind` (đã tải sẵn)
  /** Chế độ server (danh mục lớn, kind='plan'): gõ → gọi RPC tìm kiếm (debounce 250 ms, tối đa 20 mục); `items` bị bỏ qua. */
  server?: boolean
  /** Chế độ server: tên của các id đã biết (vd từ dòng đang sửa); id chưa biết được lấy qua get_lookup_items. */
  known?: Item[]
  selectedIds: number[] // ô đơn: 0 hoặc 1 id
  multiple?: boolean
  /** Cột dùng để hiển thị/tìm: 'name' (mặc định) hoặc 'code' (mục không có mã bị ẩn; "+ Thêm" tạo code = name = chữ gõ). */
  field?: 'name' | 'code'
  /** false: chỉ chọn trong danh sách có sẵn, không có "+ Thêm". */
  allowAdd?: boolean
  onChange: (ids: number[]) => void
  /** Ô đơn: true khi đang có chữ nhưng chưa chọn từ danh mục (để chặn Lưu). */
  onPending?: (pending: boolean) => void
  reload?: () => Promise<void>
  testId: string
}

// Combobox gõ để tìm; không có thì cho thêm mới vào lookup_items.
// Văn bản khởi tạo lấy từ `selectedIds`; đổi giá trị từ ngoài (Sửa/Hủy) thì remount bằng `key`.
export default function LookupCombobox({ label, kind, items: rawItems = [], server = false, known, selectedIds, multiple, field = 'name', allowAdd = true, onChange, onPending, reload, testId }: Props) {
  const uid = useId()
  const view = (list: Item[]) => (field === 'code' ? list.flatMap((i) => (i.code ? [{ ...i, name: i.code }] : [])) : list)
  // Chế độ server: tên của id = dòng đang sửa (known) hoặc bộ nhớ đệm các lần tìm trước.
  const nameOf = (id: number | undefined) => {
    const r = id === undefined ? undefined : (known?.find((k) => k.id === id) ?? recall(kind, id))
    return (field === 'code' ? r?.code : r?.name) ?? ''
  }
  const [text, setText] = useState(() => (multiple ? '' : server ? nameOf(selectedIds[0]) : (view(rawItems).find((i) => i.id === selectedIds[0])?.name ?? '')))
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1) // -1: mặc định (mục đầu nếu có)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [, rerender] = useState(0)
  const search = useMemo(() => (server ? searchFn(kind) : null), [server, kind])
  const remote = useRemoteOptions(search, text.trim(), open)
  const items = server ? view(remote.items) : view(rawItems)

  // Id đã chọn mà chưa biết tên (mở dòng cũ, ?cons=… trên URL) → hỏi server một lần.
  const missing = server && kind !== 'plan' ? selectedIds.filter((id) => !nameOf(id)).join(',') : ''
  useEffect(() => {
    if (!missing) return
    let alive = true
    resolveFn(kind, missing.split(',').map(Number)).then(() => {
      if (!alive) return
      if (!multiple) setText((t) => t || nameOf(selectedIds[0]))
      rerender((n) => n + 1)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy lại khi tập id thiếu tên đổi
  }, [missing, kind])

  const opts: Item[] = open ? (server ? items.filter((i) => !(multiple && selectedIds.includes(i.id))) : filterSuggestions(items, text, 20, multiple ? selectedIds : [])) : []
  const canAdd = allowAdd && open && text.trim() !== '' && !hasExactMatch(items, text) && (!server || remote.settled)
  const rows = opts.length + (canAdd ? 1 : 0)
  const cur = active >= 0 ? Math.min(active, rows - 1) : opts.length ? 0 : -1
  const invalid = !multiple && !open && text.trim() !== '' && selectedIds.length === 0

  function choose(item: Item) {
    if (multiple) {
      onChange([...selectedIds, item.id])
      setText('')
    } else {
      onChange([item.id])
      setText(item.name)
      onPending?.(false)
    }
    setOpen(false)
    setActive(-1)
    setErr('')
  }

  async function add() {
    const name = text.trim()
    setBusy(true)
    setErr('')
    const ins = await supabase.from('lookup_items').insert(field === 'code' ? { kind, name, code: name } : { kind, name }).select().single()
    let item: Item | null = ins.data
    if (ins.error?.code === '23505') {
      // đã có (người khác vừa thêm hoặc khác hoa/thường): lấy mục đã có
      item = (await supabase.from('lookup_items').select('*').eq('kind', kind).eq(field, name).maybeSingle()).data
      if (!item) setErr(errorMessage(ins.error))
    } else if (ins.error) setErr(errorMessage(ins.error))
    if (item) {
      remember(kind, [item])
      await reload?.()
      choose({ id: item.id, name: (field === 'code' ? item.code : item.name) ?? name })
    }
    setBusy(false)
  }

  function pick(n: number) {
    if (n < opts.length) choose(opts[n])
    else if (n === opts.length && canAdd && !busy) void add()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      if (rows) setActive(((cur < 0 ? -1 : cur) + (e.key === 'ArrowDown' ? 1 : rows - 1)) % rows)
    } else if (e.key === 'Enter' && open) {
      e.preventDefault() // không gửi form khi đang chọn
      if (cur >= 0) pick(cur)
    } else if (e.key === 'Escape') {
      if (open) e.preventDefault() // Esc chỉ đóng danh sách gợi ý, không đóng modal chứa nó
      setOpen(false)
    }
  }

  async function onBlur() {
    setOpen(false)
    if (multiple || selectedIds.length || !text.trim()) return
    // gõ đủ tên nhưng chưa bấm chọn → tự chọn mục khớp (chế độ server: tìm lại ngay, không đợi debounce)
    let list = items
    if (search && findIdByName(items, text) === null) list = view((await search(text.trim())).data ?? [])
    const id = findIdByName(list, text)
    const item = id === null ? undefined : list.find((i) => i.id === id)
    if (item) choose(item)
  }

  return (
    <div className="relative">
      <label htmlFor={`${uid}-in`} className={labelClass}>{label}{multiple ? ' (chọn nhiều)' : ''}</label>
      {multiple && selectedIds.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-1" data-testid={`${testId}-chips`}>
          {selectedIds.map((id) => {
            const name = server ? nameOf(id) : items.find((i) => i.id === id)?.name
            return name ? (
              <li key={id} className="inline-flex items-center gap-1 rounded-full bg-primary-soft text-primary-dark ring-1 ring-inset ring-primary-line pl-3 pr-1 py-1 text-sm">
                {name}
                <button type="button" aria-label={`Bỏ ${name}`} onClick={() => onChange(selectedIds.filter((x) => x !== id))}
                  className="h-6 w-6 rounded-full leading-none transition-colors duration-150 hover:bg-primary-line">×</button>
              </li>
            ) : null
          })}
        </ul>
      )}
      <input
        id={`${uid}-in`} role="combobox" aria-expanded={open && rows > 0} aria-controls={`${uid}-list`} aria-autocomplete="list"
        aria-activedescendant={open && cur >= 0 ? `${uid}-o${cur}` : undefined} aria-invalid={invalid}
        value={text} placeholder="Gõ để tìm..." autoComplete="off" data-testid={testId}
        onChange={(e) => {
          const t = e.target.value
          setText(t)
          setOpen(true)
          setActive(-1)
          if (!multiple) { onChange([]); onPending?.(t.trim() !== '') }
        }}
        onKeyDown={onKeyDown} onBlur={() => void onBlur()}
        className={inputClass}
      />
      {open && rows > 0 && (
        <ul id={`${uid}-list`} role="listbox" aria-label={label} data-testid={`${testId}-list`}
          className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-stone-200 rounded-lg shadow-lg animate-fade-in">
          {opts.map((o, n) => (
            <li key={o.id} id={`${uid}-o${n}`} role="option" aria-selected={n === cur}
              ref={(el) => { if (n === cur) el?.scrollIntoView?.({ block: 'nearest' }) }}
              onMouseDown={(e) => e.preventDefault()} onClick={() => pick(n)}
              className={`px-3 py-2 cursor-pointer ${n === cur ? 'bg-primary-soft text-primary-dark' : 'hover:bg-stone-50'}`}>
              {o.name}{o.hint && <span className="ml-2 text-sm text-muted">{o.hint}</span>}
            </li>
          ))}
          {canAdd && (
            <li id={`${uid}-o${opts.length}`} role="option" aria-selected={opts.length === cur} aria-disabled={busy}
              onMouseDown={(e) => e.preventDefault()} onClick={() => pick(opts.length)} data-testid={`${testId}-add`}
              className={`px-3 py-2 cursor-pointer font-medium text-primary border-t ${opts.length === cur ? 'bg-primary-soft' : ''}`}>
              + Thêm "{text.trim()}"
            </li>
          )}
        </ul>
      )}
      {server && open && remote.settled && opts.length === 0 && !canAdd && !remote.error && (
        <span className="block text-sm text-muted" data-testid={`${testId}-empty`}>Không có mục nào khớp.</span>
      )}
      {invalid && <span className="text-sm text-danger" data-testid={`${testId}-invalid`}>Chưa chọn từ danh mục</span>}
      {(err || (server && open && remote.error)) && <span role="alert" className="block text-sm text-danger">{err || remote.error}</span>}
    </div>
  )
}
