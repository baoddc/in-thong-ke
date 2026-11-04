import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useIncomplete } from '../lib/useIncomplete'

// "HH:mm dd/MM" giờ Việt Nam (tự ghép: định dạng vi-VN khác nhau giữa trình duyệt/Node, có nơi ra 04-11).
const when = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hour12: false })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.hour}:${p.minute} ${p.day}/${p.month}`
}

/** D-029: nhắc người tạo các phiếu/dòng còn thiếu thông tin; quá 24h thì bị khóa thao tác khác tới khi điền đủ. */
export default function IncompleteNotice() {
  const { items, blocked } = useIncomplete()
  const [open, setOpen] = useState(false)

  if (!items.length) return null
  const plans = items.filter((i) => i.item_kind === 'plan').length
  const rows = items.length - plans
  const what = [plans && `${plans} phiếu`, rows && `${rows} dòng bảng kiểm`].filter(Boolean).join(' và ')
  const tone = blocked ? 'border-danger-line bg-danger-soft text-danger' : 'border-amber-300 bg-amber-50 text-amber-900'
  return (
    <div role={blocked ? 'alert' : 'status'} className={`mb-3 rounded-card border p-2 text-sm print:hidden ${tone}`} data-testid="incomplete-notice">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1">
          {blocked
            ? <>Bạn đang bị <b>khóa thao tác</b>: còn <b>{what}</b> quá 24 giờ chưa điền đủ thông tin. Điền đủ các mục dưới đây để mở khóa.</>
            : <>Bạn có <b>{what}</b> còn thiếu thông tin.<span className="max-sm:hidden"> Chưa điền đủ trong 24 giờ kể từ lúc tạo sẽ bị khóa thao tác khác.</span><span className="sm:hidden"> Hạn điền: 24 giờ.</span></>}
        </span>
        {!blocked && ( // bị khóa: luôn hiện danh sách
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="min-h-[44px] rounded-lg border border-current bg-white px-4 py-1 font-medium sm:min-h-0 sm:px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="incomplete-toggle">
            {open ? 'Ẩn' : 'Xem'}
          </button>
        )}
      </div>
      {(open || blocked) && (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {items.map((i) => (
            <li key={`${i.item_kind}-${i.id}`} className="rounded bg-white/70 px-2 py-1">
              <Link className="inline-block py-2 font-semibold text-primary underline sm:py-0" to={`${i.item_kind === 'plan' ? '/' : '/bang-kiem'}?q=${encodeURIComponent(i.label.split(' · ')[0])}&from=&to=`}>
                {i.item_kind === 'plan' ? `Phiếu ${i.label}` : `Dòng ${i.label}`}
              </Link>
              {' — thiếu: '}{i.missing.join(', ')}
              <span className="block text-xs">Hạn điền đủ: {when(i.due_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
