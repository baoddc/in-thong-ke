// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const users = [
  { id: 'a1', username: 'admin', full_name: 'Quản Trị', role: 'admin', is_active: true, created_at: '2026-10-01T03:00:00Z', email: 'thaibao06061997@gmail.com', last_sign_in_at: '2026-10-30T07:05:00Z' },
  { id: 'u1', username: 'bao.lt', full_name: 'Lê Thái Bão', role: 'user', is_active: true, created_at: '2026-10-02T03:00:00Z', email: 'bao.lt@kho-an-ha.local', last_sign_in_at: null },
  { id: 'u2', username: 'quoc.lt', full_name: 'Lê Thái Quốc', role: 'user', is_active: false, created_at: '2026-10-03T03:00:00Z', email: 'quoc.lt@kho-an-ha.local', last_sign_in_at: null },
]
users.push({ id: 'r1', username: 'root', full_name: 'Bão Root', role: 'root', is_active: true, created_at: '2026-09-01T03:00:00Z', email: 'thaibao06061997@gmail.com', last_sign_in_at: null })
users.push({ id: 'p1', username: 'duc.nv', full_name: 'Nguyễn Văn Đức', role: 'user', is_active: false, is_pending: true, created_at: '2026-10-29T03:00:00Z', email: 'duc.nv@kho-an-ha.local', last_sign_in_at: null, approved_by_name: null, approved_at: null, created_by_name: null } as never)
Object.assign(users[1], { approved_by_name: 'Quản Trị', approved_at: '2026-10-30T07:05:00Z' })
Object.assign(users[2], { created_by_name: 'Bão Root' })
const invoke = vi.fn()
const me = { id: 'a1', role: 'admin', is_active: true }
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: (n: string, o: unknown) => invoke(n, o) } } }))
vi.mock('../lib/useProfile', () => ({ useProfile: () => ({ profile: me, isAdmin: true, isRoot: me.role === 'root', loading: false, error: '' }) }))

import UsersPage from './UsersPage'
import { ToastProvider } from '../components/ui/Toast'

const body = (action: string) => invoke.mock.calls.filter((c) => (c[1] as { body: { action: string } }).body.action === action).map((c) => (c[1] as { body: unknown }).body)

beforeAll(() => { HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
afterEach(() => { cleanup(); invoke.mockReset(); Object.assign(me, { id: 'a1', role: 'admin' }) })
const asRoot = () => Object.assign(me, { id: 'r1', role: 'root' })
const off = (id: string) => (screen.getByTestId(id) as HTMLButtonElement).disabled

function setup() {
  invoke.mockImplementation((_n: string, o: { body: { action: string; full_name?: string } }) => {
    const a = o.body.action
    if (a === 'list') return Promise.resolve({ data: users, error: null })
    if (a === 'preview_username') return Promise.resolve({ data: { username: 'bao.lt2' }, error: null })
    if (a === 'create') return Promise.resolve({ data: { ...users[1], id: 'u9', username: 'bao.lt2', full_name: o.body.full_name }, error: null })
    return Promise.resolve({ data: { ok: true }, error: null })
  })
  return render(<ToastProvider><UsersPage /></ToastProvider>)
}

describe('UsersPage', () => {
  it('hiện danh sách: họ tên, vai trò, trạng thái, đăng nhập gần nhất theo dd/MM/yyyy HH:mm (giờ VN)', async () => {
    setup()
    const table = await screen.findByTestId('user-table')
    expect(table.textContent).toContain('Lê Thái Bão')
    expect(table.textContent).toContain('bao.lt')
    const admin = within(screen.getByTestId('user-row-admin'))
    expect(admin.getByText('Admin')).toBeTruthy()
    expect(admin.getByText('Hoạt động')).toBeTruthy()
    expect(admin.getByText('30/10/2026 14:05')).toBeTruthy()
    expect(within(screen.getByTestId('user-row-quoc.lt')).getByText('Đã khóa')).toBeTruthy()
    expect(within(screen.getByTestId('user-row-bao.lt')).getByText('Chưa đăng nhập')).toBeTruthy()
  })

  it('không cho tự khóa chính mình; người khác thì được', async () => {
    setup()
    await screen.findByTestId('user-table')
    expect((screen.getByTestId('user-toggle-admin') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('user-toggle-bao.lt') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByTestId('user-toggle-quoc.lt').textContent).toBe('Mở khóa')
  })

  it('Thêm người dùng: xem trước tên đăng nhập (debounce), kiểm tra mật khẩu, gọi create đúng body, hiện tên đăng nhập + mật khẩu', async () => {
    setup()
    await screen.findByTestId('user-table')
    await userEvent.click(screen.getByTestId('add-user'))
    await userEvent.type(screen.getByTestId('user-fullname'), 'Lê Thái Bão')
    expect(body('preview_username')).toHaveLength(0) // chưa quá 400ms
    expect((await screen.findByTestId('username-preview', {}, { timeout: 2000 })).textContent).toBe('Tên đăng nhập sẽ là: bao.lt2')
    expect(body('preview_username')).toEqual([{ action: 'preview_username', full_name: 'Lê Thái Bão' }])

    await userEvent.type(screen.getByTestId('user-create-password'), 'ngan')
    await userEvent.click(screen.getByTestId('user-create-submit'))
    expect(screen.getByText('Mật khẩu phải có ít nhất 6 ký tự.')).toBeTruthy()
    expect(body('create')).toHaveLength(0)

    await userEvent.clear(screen.getByTestId('user-create-password'))
    await userEvent.type(screen.getByTestId('user-create-password'), 'matkhau123')
    await userEvent.click(screen.getByTestId('user-create-submit'))
    await waitFor(() => expect(body('create')).toEqual([{ action: 'create', full_name: 'Lê Thái Bão', password: 'matkhau123', role: 'user' }]))
    expect((await screen.findByTestId('credentials-username')).textContent).toBe('bao.lt2')
    expect(screen.getByTestId('credentials-password').textContent).toBe('matkhau123')
    expect(screen.getByTestId('credentials-copy')).toBeTruthy()
  })

  it('"Tạo ngẫu nhiên" điền mật khẩu 10 ký tự và hiện ra', async () => {
    setup()
    await userEvent.click(await screen.findByTestId('add-user').then((b) => b))
    await userEvent.click(screen.getByTestId('user-create-random'))
    const pw = screen.getByTestId('user-create-password') as HTMLInputElement
    expect(pw.value).toHaveLength(10)
    expect(pw.type).toBe('text')
  })

  it('lỗi từ function hiện toast đỏ + trong hộp thoại', async () => {
    setup()
    const { FunctionsHttpError } = await import('@supabase/supabase-js')
    invoke.mockImplementation((_n: string, o: { body: { action: string } }) =>
      o.body.action === 'list' ? Promise.resolve({ data: users, error: null })
        : Promise.resolve({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: 'Mật khẩu phải có ít nhất 6 ký tự' }), { status: 400 })) }))
    await userEvent.click(await screen.findByTestId('add-user'))
    await userEvent.type(screen.getByTestId('user-fullname'), 'An')
    await userEvent.type(screen.getByTestId('user-create-password'), 'matkhau123')
    await userEvent.click(screen.getByTestId('user-create-submit'))
    expect((await screen.findByTestId('toast-error')).textContent).toContain('Mật khẩu phải có ít nhất 6 ký tự')
    expect(screen.getByTestId('user-create-error').textContent).toBe('Mật khẩu phải có ít nhất 6 ký tự')
  })

  it('Khóa: hỏi xác nhận rồi gọi set_active active=false', async () => {
    setup()
    await userEvent.click(await screen.findByTestId('user-toggle-bao.lt'))
    await userEvent.click(screen.getByTestId('confirm-ok'))
    await waitFor(() => expect(body('set_active')).toEqual([{ action: 'set_active', user_id: 'u1', active: false }]))
  })

  it('admin: dòng root bị khóa mọi thao tác; không có ô vai trò khi thêm/sửa', async () => {
    setup()
    await screen.findByTestId('user-table')
    expect(within(screen.getByTestId('user-row-root')).getByText('Root')).toBeTruthy()
    for (const a of ['edit', 'reset', 'toggle']) expect(off(`user-${a}-root`)).toBe(true)
    expect(off('user-edit-bao.lt')).toBe(false)
    await userEvent.click(screen.getByTestId('user-edit-bao.lt'))
    expect(screen.queryByTestId('user-edit-role')).toBeNull()
    cleanup()
    setup()
    await userEvent.click(await screen.findByTestId('add-user'))
    expect(screen.queryByTestId('user-role-select')).toBeNull()
  })

  it('root: Thêm có chọn vai trò (gửi admin); Sửa chính mình/dòng root khóa ô vai trò, người khác thì sửa được', async () => {
    asRoot()
    setup()
    await userEvent.click(await screen.findByTestId('add-user'))
    await userEvent.selectOptions(screen.getByTestId('user-role-select'), 'admin')
    await userEvent.type(screen.getByTestId('user-fullname'), 'Lê Thái Bão')
    await userEvent.type(screen.getByTestId('user-create-password'), 'matkhau123')
    await userEvent.click(screen.getByTestId('user-create-submit'))
    await waitFor(() => expect(body('create')).toEqual([{ action: 'create', full_name: 'Lê Thái Bão', password: 'matkhau123', role: 'admin' }]))
    await userEvent.click(await screen.findByTestId('credentials-close'))

    await userEvent.click(screen.getByTestId('user-edit-root'))
    expect((screen.getByTestId('user-edit-role') as HTMLSelectElement).disabled).toBe(true)
    expect(screen.getByText('Không thể đổi vai trò của tài khoản root.')).toBeTruthy()
    await userEvent.click(screen.getByTestId('user-edit-cancel'))
    expect(off('user-toggle-root')).toBe(true)

    await userEvent.click(screen.getByTestId('user-edit-admin'))
    expect((screen.getByTestId('user-edit-role') as HTMLSelectElement).disabled).toBe(false)
    await userEvent.click(screen.getByTestId('user-edit-cancel'))
    expect(off('user-toggle-admin')).toBe(false)
  })

  it('chờ duyệt (D-015): badge cam, lên đầu bảng, chỉ có Duyệt/Từ chối; ghi chú Duyệt bởi/Tạo bởi', async () => {
    setup()
    const table = await screen.findByTestId('user-table')
    const rows = Array.from(table.querySelectorAll('[data-testid^="user-row-"]')).map((r) => r.getAttribute('data-testid'))
    expect(rows[0]).toBe('user-row-duc.nv')
    const row = within(screen.getByTestId('user-row-duc.nv'))
    expect(row.getByText('Chờ duyệt').className).toContain('bg-orange-100')
    expect(screen.queryByTestId('user-edit-duc.nv')).toBeNull()
    expect(screen.queryByTestId('user-toggle-duc.nv')).toBeNull()
    expect(screen.queryByTestId('user-reset-duc.nv')).toBeNull()
    expect((screen.getByTestId('user-approve-duc.nv') as HTMLButtonElement).disabled).toBe(false)
    expect(within(screen.getByTestId('user-row-bao.lt')).getByText('Duyệt bởi Quản Trị · 30/10/2026 14:05')).toBeTruthy()
    expect(within(screen.getByTestId('user-row-quoc.lt')).getByText('Tạo bởi Bão Root')).toBeTruthy()
    expect(within(screen.getByTestId('user-row-admin')).getByText('—')).toBeTruthy()
  })

  it('Duyệt gọi action approve; Từ chối hỏi xác nhận rồi gọi reject', async () => {
    setup()
    await userEvent.click(await screen.findByTestId('user-approve-duc.nv'))
    await waitFor(() => expect(body('approve')).toEqual([{ action: 'approve', user_id: 'p1' }]))
    expect(body('reject')).toHaveLength(0)

    await userEvent.click(screen.getByTestId('user-reject-duc.nv'))
    expect(screen.getByTestId('confirm-dialog').textContent).toContain('Từ chối sẽ xóa hẳn yêu cầu đăng ký của Nguyễn Văn Đức')
    expect(body('reject')).toHaveLength(0) // chưa xác nhận
    await userEvent.click(screen.getByTestId('confirm-ok'))
    await waitFor(() => expect(body('reject')).toEqual([{ action: 'reject', user_id: 'p1' }]))
  })

  it('bộ lọc nhanh "Chờ duyệt (n)" chỉ giữ dòng chờ duyệt', async () => {
    setup()
    await screen.findByTestId('user-table')
    expect(screen.getByTestId('filter-pending').textContent).toBe('Chờ duyệt (1)')
    await userEvent.click(screen.getByTestId('filter-pending'))
    expect(screen.queryByTestId('user-row-bao.lt')).toBeNull()
    expect(screen.getByTestId('user-row-duc.nv')).toBeTruthy()
    await userEvent.click(screen.getByTestId('filter-all'))
    expect(screen.getByTestId('user-row-bao.lt')).toBeTruthy()
  })

  it('lỗi tải danh sách → thông báo + nút Thử lại', async () => {
    invoke.mockResolvedValue({ data: { error: 'Chỉ quản trị viên mới được quản lý người dùng' }, error: null })
    render(<ToastProvider><UsersPage /></ToastProvider>)
    expect((await screen.findByTestId('page-error')).textContent).toContain('Chỉ quản trị viên')
    expect(screen.getByTestId('page-retry')).toBeTruthy()
  })
})
