// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./pages/UsersPage', () => ({ default: () => <p>Trang người dùng</p> }))
const invoke = vi.fn()
vi.mock('./lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() }, functions: { invoke: (n: string, o: unknown) => invoke(n, o) } } }))
const prof: { value: { id: string; full_name: string; role: 'root' | 'admin' | 'user'; is_active: boolean } | null } = { value: null }
vi.mock('./lib/useProfile', () => ({
  ProfileProvider: ({ children }: { children: unknown }) => children,
  useProfile: () => ({ profile: prof.value, isAdmin: prof.value?.role === 'admin' || prof.value?.role === 'root', isRoot: prof.value?.role === 'root', loading: false, error: '' }),
}))

import { AccessGate, AdminOnly, Layout } from './App'

afterEach(() => { cleanup(); localStorage.clear(); prof.value = null })

const renderLayout = () => render(
  <MemoryRouter>
    <Routes><Route element={<Layout email="a@b.vn" />}><Route path="/" element={<p>Nội dung</p>} /></Route></Routes>
  </MemoryRouter>,
)

describe('Quyền người dùng (D-013)', () => {
  it('user thường: sidebar không có "Quản lý người dùng", hiện họ tên + badge "Người dùng"', () => {
    prof.value = { id: 'u', full_name: 'Lê Thái Bão', role: 'user', is_active: true }
    renderLayout()
    expect(screen.queryByRole('link', { name: 'Quản lý người dùng' })).toBeNull()
    expect(screen.getByTestId('user-name').textContent).toBe('Lê Thái Bão')
    expect(screen.getByTestId('user-role').textContent).toBe('Người dùng')
  })

  it('admin: có "Quản lý người dùng" ở cuối danh sách, badge "Admin"', () => {
    prof.value = { id: 'a', full_name: 'Quản trị', role: 'admin', is_active: true }
    renderLayout()
    const links = Array.from(screen.getByRole('navigation', { name: 'Menu chính' }).querySelectorAll('a'))
    const last = links[links.length - 1]
    expect(last.textContent).toBe('Quản lý người dùng')
    expect(last.getAttribute('href')).toBe('/nguoi-dung')
    expect(screen.getByTestId('user-role').textContent).toBe('Admin')
  })

  it('root: có "Quản lý người dùng", badge "Root" màu nổi khác admin', () => {
    prof.value = { id: 'r', full_name: 'Bão', role: 'root', is_active: true }
    renderLayout()
    expect(screen.getByRole('link', { name: 'Quản lý người dùng' })).toBeTruthy()
    const badge = screen.getByTestId('user-role')
    expect(badge.textContent).toBe('Root')
    expect(badge.className).toContain('bg-amber-400')
  })

  it('admin: badge số tài khoản chờ duyệt ở mục Quản lý người dùng; user thường không gọi list', async () => {
    invoke.mockResolvedValue({ data: [{ is_pending: true }, { is_pending: true }, { is_pending: false }], error: null })
    prof.value = { id: 'a', full_name: 'Quản trị', role: 'admin', is_active: true }
    renderLayout()
    expect((await screen.findByTestId('pending-badge')).textContent).toBe('2')
    expect(invoke).toHaveBeenCalledWith('admin-users', { body: { action: 'list' } })
    cleanup()
    invoke.mockClear()
    prof.value = { id: 'u', full_name: 'A', role: 'user', is_active: true }
    renderLayout()
    expect(screen.queryByTestId('pending-badge')).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('route /nguoi-dung chặn user thường (chuyển về /), admin vào được', () => {
    const go = () => render(
      <MemoryRouter initialEntries={['/nguoi-dung']}>
        <Routes>
          <Route path="/" element={<p>Trang chủ</p>} />
          <Route path="/nguoi-dung" element={<AdminOnly><p>Trang người dùng</p></AdminOnly>} />
        </Routes>
      </MemoryRouter>,
    )
    prof.value = { id: 'u', full_name: 'A', role: 'user', is_active: true }
    go()
    expect(screen.queryByText('Trang người dùng')).toBeNull()
    expect(screen.getByText('Trang chủ')).toBeTruthy()
    cleanup()
    prof.value = { id: 'a', full_name: 'A', role: 'admin', is_active: true }
    go()
    expect(screen.getByText('Trang người dùng')).toBeTruthy()
    cleanup()
    prof.value = { id: 'r', full_name: 'A', role: 'root', is_active: true }
    go()
    expect(screen.getByText('Trang người dùng')).toBeTruthy()
  })

  it('không có hồ sơ hoặc bị khóa → thông báo + nút Đăng xuất, không hiện menu', () => {
    render(<MemoryRouter><AccessGate email="x@y.vn" /></MemoryRouter>)
    expect(screen.getByTestId('access-denied')).toBeTruthy()
    expect(screen.getByTestId('access-signout').textContent).toBe('Đăng xuất')
    cleanup()
    prof.value = { id: 'u', full_name: 'A', role: 'user', is_active: false }
    render(<MemoryRouter><AccessGate email="x@y.vn" /></MemoryRouter>)
    expect(screen.getByTestId('access-denied').textContent).toContain('đã bị khóa')
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})

describe('Layout sidebar', () => {
  it('có 6 mục theo thứ tự, Giới thiệu cuối nhóm mục chính (sau Luồng công việc)', () => {
    renderLayout()
    const labels = screen.getByRole('navigation', { name: 'Menu chính' }).textContent
    expect(labels).toBe('Nhập phiếuBảng kiểmIn thống kêDanh mụcLuồng công việcGiới thiệu')
  })

  it('khung đúng bằng màn hình từ md (không cuộn cả trang), vẫn cuộn bình thường trên điện thoại và khi in', () => {
    renderLayout()
    const main = screen.getByRole('main')
    const root = main.parentElement!
    expect(root.className).toMatch(/\bmd:h-dvh\b/)
    expect(root.className).toMatch(/\bmd:overflow-hidden\b/)
    expect(root.className).toMatch(/\bprint:h-auto\b/)
    expect(main.className).toMatch(/\bmd:overflow-y-auto\b/)
    expect(root.className).not.toMatch(/(^|\s)(h-dvh|overflow-hidden)(\s|$)/) // không khóa cuộn ở mobile
  })

  it('đủ 6 mục, mỗi mục là liên kết có nhãn đọc được (kể cả mục đang chọn "Nhập phiếu")', () => {
    renderLayout()
    const nav = screen.getByRole('navigation', { name: 'Menu chính' })
    const links = Array.from(nav.querySelectorAll('a'))
    expect(links.map((a) => a.textContent)).toEqual(['Nhập phiếu', 'Bảng kiểm', 'In thống kê', 'Danh mục', 'Luồng công việc', 'Giới thiệu'])
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/bang-kiem', '/in-thong-ke', '/danh-muc', '/luong-cong-viec', '/gioi-thieu'])
    for (const name of ['Nhập phiếu', 'Bảng kiểm', 'In thống kê', 'Danh mục', 'Luồng công việc', 'Giới thiệu']) expect(screen.getByRole('link', { name })).toBeTruthy()
    // mục đang chọn: chữ trắng trên nền sidebar tối, không phụ thuộc nền riêng (lỗi cũ: chữ trắng + nền primary không vẽ → "mất" mục)
    const active = screen.getByRole('link', { name: 'Nhập phiếu' })
    expect(active.getAttribute('aria-current')).toBe('page')
    expect(active.className).toContain('text-white')
    expect(active.className).not.toMatch(/\bbg-primary\b/)
    expect(links.every((a) => !/\b(hidden|invisible)\b/.test(a.className))).toBe(true)
  })

  it('thu gọn ẩn nhãn (còn aria-label/title), mở rộng hiện lại và nhớ trạng thái', async () => {
    renderLayout()
    expect(screen.getByText('Bảng kiểm')).toBeTruthy()
    await userEvent.click(screen.getByTestId('toggle-sidebar'))
    expect(screen.queryByText('Bảng kiểm')).toBeNull()
    expect(screen.getByLabelText('Bảng kiểm').getAttribute('title')).toBe('Bảng kiểm')
    expect(localStorage.getItem('sidebar-collapsed')).toBe('1')
    await userEvent.click(screen.getByTestId('toggle-sidebar'))
    expect(screen.getByText('Bảng kiểm')).toBeTruthy()
  })
})
