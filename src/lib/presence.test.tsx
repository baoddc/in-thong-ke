// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  sync: null as null | (() => void), state: {} as Record<string, unknown[]>, tracks: [] as unknown[], removed: 0, untracked: 0, cfg: null as unknown, role: 'admin',
  handlers: {} as Record<string, (p: unknown) => void>, sent: [] as { event: string; payload: Record<string, unknown> }[],
}))
vi.mock('./supabase', () => ({
  supabase: {
    channel: (_n: string, cfg: unknown) => {
      h.cfg = cfg
      const ch = {
        on: (t: string, o: { event: string }, cb: (p: unknown) => void) => { h.handlers[`${t}:${o.event}`] = cb; if (t === 'presence' && o.event === 'sync') h.sync = cb as () => void; return ch },
        subscribe: (cb: (s: string) => void) => { cb('SUBSCRIBED'); return ch },
        send: (m: { event: string; payload: Record<string, unknown> }) => { h.sent.push(m); return Promise.resolve('ok') },
        presenceState: () => h.state,
        track: (p: unknown) => { h.tracks.push(p); return Promise.resolve('ok') },
        untrack: () => { h.untracked++; return Promise.resolve('ok') },
      }
      return ch
    },
    removeChannel: () => { h.removed++ },
  },
}))
vi.mock('./useProfile', () => ({ useProfile: () => ({ profile: { id: 'me', username: 'bao.lt', full_name: 'Bão', avatar_path: 'me/1700000000000.webp', role: h.role } }) }))

import { PresenceProvider, useReportActivity, useShareDraft, type Activity, type DraftBody } from './presence'
import { DraftRows, EditingTag, OnlineUsers } from '../components/PresenceViews'

const NAMES: Record<string, string> = { 'hoa.nt': 'Nguyễn Thị Hoa', 'minh.tv': '' } // minh.tv: chưa có họ tên → dùng username
const peer = (userId: string, username: string, activity: Activity) => ({ userId, username, fullName: NAMES[username] ?? '', page: '/', activity })
function Reporter({ a }: { a: Activity }) { useReportActivity(a); return null }
function Sharer({ d }: { d: DraftBody | null }) { useShareDraft(d); return null }
const COLS = ['tk', 'date', 'note', 'actions']
const mount = (a: Activity = null, d: DraftBody | null = null) => render(
  <MemoryRouter><PresenceProvider>
    <Reporter a={a} /><Sharer d={d} /><OnlineUsers showLabels /><table><tbody><DraftRows table="plans" columnKeys={COLS} /></tbody></table><EditingTag kind="plan" id={5} /><EditingTag kind="detail" id={9} />
  </PresenceProvider></MemoryRouter>,
)
const recv = (payload: unknown) => act(async () => { h.handlers['broadcast:draft']?.({ payload }) })
const draftOf = (key: string, extra: Record<string, unknown> = {}) => ({
  key, userId: 'u2', username: 'hoa.nt', fullName: 'Nguyễn Thị Hoa', table: 'plans', mode: 'add', expiresAt: Date.now() + 125_000,
  values: { tk: 'TK2026/11-005', date: '03/11/2026', note: 'giao gấp' }, ...extra,
})
const sync = (state: Record<string, unknown[]>) => act(async () => { h.state = state; h.sync?.() })
const self = () => (h.cfg as { config: { presence: { key: string } } }).config.presence.key
const lastTrack = () => h.tracks[h.tracks.length - 1] as { activity: Activity; username: string; page: string }

beforeEach(() => { h.state = {}; h.tracks = []; h.removed = 0; h.untracked = 0; h.sync = null; h.handlers = {}; h.sent = []; h.role = 'admin' })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Presence (D-024)', () => {
  it('track với username/trang và activity báo bởi component; đổi thành null thì track lại null; unmount thì untrack + removeChannel', async () => {
    const act1: Activity = { kind: 'adding_plan', tk: 'TK2026/11-005', expiresAt: Date.now() + 300_000 }
    const { rerender, unmount } = mount(act1)
    expect((h.cfg as { config: { presence: { key: string } } }).config.presence.key).toMatch(/^me:/)
    await waitFor(() => expect(lastTrack()).toMatchObject({ username: 'bao.lt', page: '/', activity: act1 }))
    rerender(<MemoryRouter><PresenceProvider><Reporter a={null} /></PresenceProvider></MemoryRouter>)
    await waitFor(() => expect(lastTrack().activity).toBeNull())
    unmount()
    expect(h.untracked).toBe(1)
    expect(h.removed).toBe(1)
  })

  it('sidebar: số người trực tuyến (gộp tab), người khác kèm mô tả việc; không ai → ẩn', async () => {
    mount()
    expect(screen.queryByTestId('online-users')).toBeNull()
    await sync({
      [self()]: [peer('me', 'bao.lt', null)],
      'u2:a': [peer('u2', 'hoa.nt', null)], 'u2:b': [peer('u2', 'hoa.nt', { kind: 'adding_plan', tk: 'TK2026/11-005', expiresAt: Date.now() + 60_000 })],
      'u3:a': [peer('u3', 'minh.tv', { kind: 'adding_detail', tk: 'TK2026/11-001' })],
    })
    const box = screen.getByTestId('online-users')
    expect(box.textContent).toContain('Đang trực tuyến (3)')
    const items = screen.getAllByTestId('online-user')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toBe('Nguyễn Thị Hoađang thêm phiếu · giữ TK2026/11-005')
    expect(items[1].textContent).toBe('minh.tvđang nhập bảng kiểm TK2026/11-001')
  })

  it('D-025: nhận nháp → dòng chỉ đọc có giá trị, tên, TK, đếm ngược, ô focus có khung; cập nhật; clear → gỡ', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    mount()
    await sync({ [self()]: [peer('me', 'bao.lt', null)], 'u2:a': [peer('u2', 'hoa.nt', null)] })
    await recv(draftOf('u2:a', { focus: 'note' }))
    const row = screen.getByTestId('draft-row')
    expect(screen.getByTestId('draft-cell-tk').textContent).toBe('TK2026/11-005Nguyễn Thị Hoa đang nhập · còn 02:05')
    expect(screen.getByTestId('draft-cell-date').textContent).toBe('03/11/2026')
    expect(screen.getByTestId('draft-cell-note').textContent).toBe('Nguyễn Thị Hoagiao gấp') // tên nhỏ ở góc ô focus
    expect(screen.getAllByTestId('draft-focus')).toHaveLength(1)
    expect(screen.getByTestId('draft-cell-note').getAttribute('style')).toContain('box-shadow')
    expect(screen.getByTestId('draft-cell-date').getAttribute('style')).toBeNull()
    expect(row.getAttribute('style')).toContain('background-color')
    await act(async () => { vi.advanceTimersByTime(4000) })
    expect(screen.getByTestId('draft-countdown').textContent).toBe('02:01')
    await recv(draftOf('u2:a', { values: { tk: 'TK2026/11-005', date: '04/11/2026' } }))
    expect(screen.getAllByTestId('draft-row')).toHaveLength(1)
    expect(screen.getByTestId('draft-cell-date').textContent).toBe('04/11/2026')
    await recv({ key: 'u2:a', clear: true })
    expect(screen.queryByTestId('draft-row')).toBeNull()
  })

  it('T-071: nháp người khác qua expiresAt thì gỡ ngay khỏi bảng, không chờ broadcast', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    mount()
    await sync({ [self()]: [peer('me', 'bao.lt', null)], 'u2:a': [peer('u2', 'hoa.nt', null)] })
    await recv(draftOf('u2:a'))
    expect(screen.getAllByTestId('draft-row')).toHaveLength(1)
    await act(async () => { vi.advanceTimersByTime(126_000) })
    expect(screen.queryByTestId('draft-row')).toBeNull()
  })

  it('D-025: bỏ qua nháp của chính mình, nháp bảng khác; người rời presence thì gỡ nháp; nháp > 60 giây không cập nhật thì gỡ', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    mount()
    await sync({ [self()]: [peer('me', 'bao.lt', null)], 'u2:a': [peer('u2', 'hoa.nt', null)], 'u3:a': [peer('u3', 'minh.tv', null)] })
    await recv(draftOf(self()))
    await recv(draftOf('u2:a', { table: 'details' }))
    expect(screen.queryByTestId('draft-row')).toBeNull()
    await recv(draftOf('u2:a'))
    await recv(draftOf('u3:a', { userId: 'u3', username: 'minh.tv' }))
    expect(screen.getAllByTestId('draft-row')).toHaveLength(2)
    await sync({ [self()]: [peer('me', 'bao.lt', null)], 'u3:a': [peer('u3', 'minh.tv', null)] }) // u2 rời
    expect(screen.getAllByTestId('draft-row')).toHaveLength(1)
    await act(async () => { vi.advanceTimersByTime(70_000) })
    expect(screen.queryByTestId('draft-row')).toBeNull()
  })

  it('D-025: gửi kèm key/username/mode; người mới vào (presence join) thì gửi lại nháp của mình', async () => {
    const d: DraftBody = { table: 'plans', values: { tk: 'TK1' }, focus: 'note' }
    mount(null, d)
    await waitFor(() => expect(h.sent[h.sent.length - 1]?.payload).toMatchObject({ key: self(), username: 'bao.lt', fullName: 'Bão', table: 'plans', mode: 'add', focus: 'note', values: { tk: 'TK1' } }), { timeout: 2000 })
    const n = h.sent.length
    await act(async () => { h.handlers['presence:join']?.({}) })
    expect(h.sent.length).toBe(n + 1)
  })

  it('D-025: dòng nhập của mình gửi nháp (throttle, bản cuối) khi gõ và gửi clear khi gỡ', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const view = (d: DraftBody | null) => (
      <MemoryRouter><PresenceProvider><Sharer d={d} /></PresenceProvider></MemoryRouter>
    )
    const { rerender } = render(view({ table: 'plans', values: { note: 'a' } }))
    await act(async () => { vi.advanceTimersByTime(250) })
    expect(h.sent).toHaveLength(1)
    rerender(view({ table: 'plans', values: { note: 'ab' } }))
    rerender(view({ table: 'plans', values: { note: 'abc' }, focus: 'note' }))
    expect(h.sent).toHaveLength(1) // chưa tới 200 ms
    await act(async () => { vi.advanceTimersByTime(250) })
    expect(h.sent).toHaveLength(2)
    expect(h.sent[1].payload).toMatchObject({ values: { note: 'abc' }, focus: 'note' })
    rerender(view(null))
    await act(async () => { vi.advanceTimersByTime(250) })
    expect(h.sent[2].payload).toEqual({ key: self(), clear: true })
  })

  it('kênh private; payload sai kiểu từ người khác bị bỏ qua, không làm sập app; payload hợp lệ vẫn hiện', async () => {
    mount()
    expect((h.cfg as { config: { private: boolean } }).config.private).toBe(true)
    await sync({
      'x:1': [{ userId: 1, username: 'u', fullName: {}, page: '/', activity: null }],
      'x:2': [{ userId: 'x2', username: 'u', fullName: '', page: '/', activity: { kind: 'editing_plan', planId: 'a', tk: 'T' } }],
      'u2:a': [peer('u2', 'hoa.nt', null)],
    })
    expect(screen.getAllByTestId('online-user')).toHaveLength(1)
    await recv({ key: 'y:2', userId: 'b', username: 'b', table: 'plans', mode: 'add', values: { a: {} } }) // giá trị sai bị bỏ, dòng rỗng
    await recv({ key: 'y:3', userId: 'b', username: 'b', table: 'evil', mode: 'add', values: {} })
    await recv({ key: 'y:4', userId: {}, username: 'b', table: 'plans', mode: 'add', values: {} })
    await recv(draftOf('u2:a', { values: { tk: 'TK1', note: 5, bad: {} } }))
    expect(screen.getAllByTestId('draft-row')).toHaveLength(2) // y:2 (rỗng) + u2:a
    expect(screen.getAllByTestId('draft-cell-note')[1].textContent).toBe('5')
  })

  it('ảnh đại diện: gửi kèm khi track; ảnh của người khác chỉ nhận đúng mẫu và đúng thư mục của chính họ', async () => {
    mount()
    await waitFor(() => expect(lastTrack()).toMatchObject({ avatarPath: 'me/1700000000000.webp' }))
    const [U2, U3, U4, U5] = [2, 3, 4, 5].map((n) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${String(n).repeat(12)}`) // id người dùng là UUID
    await sync({
      'a:a': [{ ...peer(U2, 'hoa.nt', null), avatarPath: `${U2}/1700000000000.webp` }],
      'b:a': [{ ...peer(U3, 'minh.tv', null), avatarPath: `${U2}/1700000000000.webp` }], // trỏ sang ảnh của người khác
      'c:a': [{ ...peer(U4, 'x', null), avatarPath: `../${U4}/1700000000000.webp` }], // đi ra ngoài thư mục
      'd:a': [{ ...peer(U5, 'y', null), avatarPath: 5 }], // sai kiểu
    })
    const rows = screen.getAllByTestId('online-user')
    expect(rows).toHaveLength(4)
    expect(within(rows[0]).getByTestId('avatar-img').getAttribute('src')).toContain(`/avatars/${U2}/1700000000000.webp`)
    for (const r of rows.slice(1)) expect(within(r).queryByTestId('avatar-img')).toBeNull()
  })

  it('tài khoản cao nhất hoạt động ẩn: không track, không phát bản nháp, không báo đang làm gì; vẫn xem được người khác', async () => {
    h.role = 'root'
    mount({ kind: 'adding_plan', tk: 'TK2026/11-005', expiresAt: Date.now() + 300_000 }, { table: 'plans', values: { tk: 'TK1' } })
    await new Promise((r) => setTimeout(r, 600)) // quá thời gian gom (200 ms) của cả track lẫn bản nháp
    expect(h.tracks).toHaveLength(0)
    expect(h.sent).toHaveLength(0)
    await sync({ 'u2:a': [peer('u2', 'hoa.nt', null)] })
    expect(screen.getAllByTestId('online-user')).toHaveLength(1) // vẫn thấy người khác
  })

  it('người dùng thường (không phải tài khoản cao nhất) vẫn track và phát bản nháp bình thường', async () => {
    h.role = 'user'
    mount({ kind: 'adding_plan', tk: 'TK2026/11-005', expiresAt: Date.now() + 300_000 }, { table: 'plans', values: { tk: 'TK1' } })
    await waitFor(() => expect(h.tracks.length).toBeGreaterThan(0))
    await waitFor(() => expect(h.sent.length).toBeGreaterThan(0))
  })

  it('nhãn "đang sửa" chỉ hiện trên đúng dòng và chỉ cho người khác', async () => {
    mount()
    await sync({
      [self()]: [peer('me', 'bao.lt', { kind: 'editing_plan', planId: 5, tk: 'TK1' })],
      'u2:a': [peer('u2', 'hoa.nt', { kind: 'editing_detail', detailId: 9, tk: 'TK2' })],
    })
    expect(screen.queryByTestId('editing-tag-plan-5')).toBeNull() // chính mình
    expect(screen.getByTestId('editing-tag-detail-9').textContent).toBe('Nguyễn Thị Hoa đang sửa')
    expect(screen.queryByTestId('editing-tag-detail-8')).toBeNull()
  })
})
