import { useEffect, useState } from 'react'
import { describeActivity, personColor, useDrafts, usePresence, type Peer } from '../lib/presence'
import { formatCountdown } from '../lib/usePlanForm'

/** Họ tên đầy đủ; trống thì dùng tên đăng nhập. */
const who = (p: { fullName?: string; username: string }) => p.fullName?.trim() || p.username

/** Sidebar: số người trực tuyến + việc từng người (gộp nhiều tab). Chưa kết nối/không có ai → ẩn. */
export function OnlineUsers({ showLabels }: { showLabels: boolean }) {
  const { peers, selfKey } = usePresence()
  if (peers.length === 0) return null
  const byUser = new Map<string, Peer[]>()
  for (const p of peers) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p])
  const others = [...byUser.entries()].filter(([, tabs]) => !tabs.some((t) => t.key === selfKey))
  const label = `Đang trực tuyến (${byUser.size})`
  if (!showLabels) {
    return <div className="flex items-center justify-center gap-1 py-1 text-xs text-slate-300" title={label} aria-label={label} data-testid="online-users"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-green-400" />{byUser.size}</div>
  }
  return (
    <div className="px-2 py-1" data-testid="online-users">
      <p className="flex items-center gap-2 text-xs font-semibold text-slate-300"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-green-400" />{label}</p>
      <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto">
        {others.map(([id, tabs]) => {
          const act = tabs.find((t) => t.activity)?.activity ?? null
          return (
            <li key={id} className="text-xs leading-tight text-slate-200" data-testid="online-user">
              <span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: personColor(id).solid }} />
              <span className="font-medium" title={tabs[0].username}>{who(tabs[0])}</span>
              {act && <span className="block text-slate-400">{describeActivity(act)}</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Countdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const left = Math.ceil((expiresAt - now) / 1000)
  return left > 0 ? <>còn <span className="tabular-nums" data-testid="draft-countdown">{formatCountdown(left)}</span></> : <>hết hạn giữ</>
}

/** D-025: dòng nháp chỉ đọc của từng người KHÁC đang thêm dòng ở bảng này (đặt đầu tbody); ô họ đang đứng có khung màu + tên. */
export function DraftRows({ table, columnKeys }: { table: 'plans' | 'details'; columnKeys: string[] }) {
  const drafts = useDrafts()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <>
      {drafts.filter((d) => d.table === table && !(d.expiresAt && d.expiresAt <= now)).map((d) => { // hết hạn giữ → gỡ ngay, không chờ broadcast
        const c = personColor(d.userId)
        return (
          <tr key={d.key} data-testid="draft-row" style={{ backgroundColor: c.soft, boxShadow: `inset 4px 0 0 ${c.solid}` }}>
            {columnKeys.map((k, i) => (
              <td key={k} data-testid={`draft-cell-${k}`} className={`relative px-2.5 py-1.5 align-top ${i === 0 ? 'sticky left-0 z-[1] bg-inherit' : ''}`}
                style={d.focus === k ? { boxShadow: `inset 0 0 0 2px ${c.solid}` } : undefined}>
                {d.focus === k && <span className="absolute left-0 top-0 max-w-full truncate whitespace-nowrap px-1 text-[10px] font-semibold leading-tight text-white" style={{ backgroundColor: c.solid }} title={d.username} data-testid="draft-focus">{who(d)}</span>}
                {k === 'actions' ? null : d.values[k]}
                {k === 'tk' && (
                  <span className="block text-xs text-gray-700">
                    <span className="font-semibold" style={{ color: c.solid }} title={d.username}>{who(d)} đang nhập</span>
                    {d.expiresAt ? <> · <Countdown expiresAt={d.expiresAt} /></> : null}
                  </span>
                )}
              </td>
            ))}
          </tr>
        )
      })}
    </>
  )
}

/** Nhãn "<user> đang sửa" cho dòng mà người KHÁC đang sửa (màu riêng của người đó). */
export function EditingTag({ kind, id }: { kind: 'plan' | 'detail'; id: number }) {
  const { peers, selfKey } = usePresence()
  const p = peers.find((x) => x.key !== selfKey && (kind === 'plan' ? x.activity?.kind === 'editing_plan' && x.activity.planId === id : x.activity?.kind === 'editing_detail' && x.activity.detailId === id))
  if (!p) return null
  return <span className="ml-2 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: personColor(p.userId).solid }} title={p.username} data-testid={`editing-tag-${kind}-${id}`}>{who(p)} đang sửa</span>
}
