import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useDbChange } from '../lib/dbChanges'
import type { Database } from '../types/database'

type Item = Database['public']['Functions']['my_incomplete_items']['Returns'][number]

// "HH:mm dd/MM" giờ Việt Nam (tự ghép: định dạng vi-VN khác nhau giữa trình duyệt/Node, có nơi ra 04-11).
const when = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hour12: false })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.hour}:${p.minute} ${p.day}/${p.month}`
}

/** D-027: nhắc người tạo các phiếu/dòng còn thiếu thông tin — quá 24h sẽ tự xóa (phiếu đã có dòng thì không xóa, chỉ nhắc). */
export default function IncompleteNotice() {
  const { pathname } = useLocation()
  const [items, setItems] = useState<Item[]>([])
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)
  useDbChange(['transport_plans', 'transport_plan_material_exporters', 'inspection_details'], () => setTick((t) => t + 1), 1000) // D-028

  useEffect(() => {
    let alive = true
    const load = () => supabase.rpc('my_incomplete_items').then((r) => { if (alive && !r.error) setItems(r.data ?? []) })
    void load()
    const t = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [pathname, tick])

  if (!items.length) return null
  const plans = items.filter((i) => i.item_kind === 'plan').length
  const rows = items.length - plans
  const what = [plans && `${plans} phiếu`, rows && `${rows} dòng bảng kiểm`].filter(Boolean).join(' và ')
  return (
    <div role="status" className="mb-3 rounded-card border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 print:hidden" data-testid="incomplete-notice">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1">Bạn có <b>{what}</b> còn thiếu thông tin. Chưa điền đủ trong 24 giờ kể từ lúc tạo sẽ bị tự xóa.</span>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="rounded-lg border border-amber-300 bg-white px-2 py-1 font-medium hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="incomplete-toggle">
          {open ? 'Ẩn' : 'Xem'}
        </button>
      </div>
      {open && (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {items.map((i) => (
            <li key={`${i.item_kind}-${i.id}`} className="rounded bg-white/70 px-2 py-1">
              <Link className="font-semibold text-primary underline" to={`${i.item_kind === 'plan' ? '/' : '/bang-kiem'}?q=${encodeURIComponent(i.label.split(' · ')[0])}&from=&to=`}>
                {i.item_kind === 'plan' ? `Phiếu ${i.label}` : `Dòng ${i.label}`}
              </Link>
              {' — thiếu: '}{i.missing.join(', ')}
              <span className="block text-xs">
                {i.delete_at ? `Tự xóa lúc ${when(i.delete_at)}` : 'Phiếu đã có dòng bảng kiểm nên không bị xóa — vui lòng điền đủ (quá 24 giờ thì dùng "Yêu cầu sửa" để mở khóa)'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
