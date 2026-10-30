import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useSession } from './lib/useSession'
import Icon, { type IconName } from './components/ui/Icon'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import { usePendingCount } from './lib/useAdminUsers'
import PlansPage from './pages/PlansPage'
import InspectionPage from './pages/InspectionPage'
import PrintPage from './pages/PrintPage'
import LookupsPage from './pages/LookupsPage'
import WorkflowPage from './pages/WorkflowPage'
import AboutPage from './pages/AboutPage'
import UsersPage from './pages/UsersPage'
import { ProfileProvider, useProfile } from './lib/useProfile'
import { ROLE_LABEL } from './lib/auth'
import Button from './components/ui/Button'

const STORAGE_KEY = 'sidebar-collapsed'

type NavItem = { to: string; label: string; icon: IconName; end?: boolean }
const ITEMS: NavItem[] = [
  { to: '/', label: 'Nhập phiếu', icon: 'plan', end: true },
  { to: '/bang-kiem', label: 'Bảng kiểm', icon: 'inspection' },
  { to: '/in-thong-ke', label: 'In thống kê', icon: 'print' },
  { to: '/danh-muc', label: 'Danh mục', icon: 'lookup' },
  { to: '/luong-cong-viec', label: 'Luồng công việc', icon: 'workflow' },
  { to: '/gioi-thieu', label: 'Giới thiệu', icon: 'info' },
]
const ADMIN_ITEMS: NavItem[] = [{ to: '/nguoi-dung', label: 'Quản lý người dùng', icon: 'user' }] // D-013/D-014: admin và root

function readCollapsed() {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

/** Ô vuông trắng chứa biểu tượng Đại Dũng (cắt từ ảnh header) — nổi trên nền tối. */
function LogoTile({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ${className}`}>
      <img src="/logo-daidung.png" alt="Đại Dũng" className="max-h-full max-w-full object-contain" />
    </span>
  )
}

export function Layout({ email }: { email: string }) {
  const { profile, isAdmin } = useProfile()
  const displayName = profile?.full_name || email
  const pending = usePendingCount(isAdmin) // D-015: badge số tài khoản chờ duyệt
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawer, setDrawer] = useState(false) // ngăn kéo trên màn hình nhỏ
  const showLabels = !collapsed || drawer // ngăn kéo luôn hiện nhãn

  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer])

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* bỏ qua: chỉ mất ghi nhớ */ }
  }

  // Sidebar nền tối cố định: mục đang chọn = chữ trắng + vạch đỏ bên trái, luôn đọc được (không phụ thuộc màu nền riêng của mục).
  const row = `flex min-h-10 items-center gap-3 rounded-lg border-l-4 py-2 whitespace-nowrap transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${showLabels ? 'px-3' : 'justify-center'}`
  const link = ({ isActive }: { isActive: boolean }) =>
    `${row} ${isActive ? 'border-primary-brand bg-white/15 font-semibold text-white' : 'border-transparent text-slate-300 hover:bg-white/10 hover:text-white'}`
  const hint = (text: string) => (showLabels ? {} : { title: text, 'aria-label': text })

  return (
    // Từ md: khung đúng bằng màn hình, không cuộn cả trang — bảng tự cuộn bên trong; khi in thì trả về dòng chảy bình thường.
    <div className="min-h-screen bg-surface text-gray-900 md:flex md:h-dvh md:min-h-0 md:overflow-hidden print:block print:h-auto print:overflow-visible">
      <header className="md:hidden print:hidden flex items-center gap-3 border-b-2 border-primary-brand bg-white p-2 shadow-sm">
        <button onClick={() => setDrawer(true)} aria-label="Mở menu" className="flex h-10 w-10 items-center justify-center rounded-lg border border-line transition duration-150 hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="open-drawer">
          <Icon name="menu" />
        </button>
        <img src="/logo-daidung.png" alt="" className="h-8 w-auto" />
        <span className="font-bold leading-tight">Kho An Hạ <span className="block text-xs font-normal text-muted">Công ty Đại Dũng</span></span>
      </header>

      {drawer && <div className="fixed inset-0 z-30 animate-fade-in bg-slate-900/50 md:hidden print:hidden" onClick={() => setDrawer(false)} data-testid="drawer-overlay" />}

      <aside className={`print:hidden fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-ink p-2 text-slate-200 shadow-xl transition-all duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 md:shadow-none md:visible ${collapsed ? 'md:w-16' : 'md:w-60'} ${drawer ? 'translate-x-0' : '-translate-x-full invisible'}`}>
        <div className={`flex items-center gap-3 px-1 pb-3 pt-2 ${showLabels ? '' : 'justify-center'}`} data-testid="brand">
          <LogoTile className={showLabels ? 'h-11 w-11' : 'h-10 w-10'} />
          {showLabels && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-base font-bold text-white">Kho An Hạ</p>
              <p className="truncate text-xs text-slate-400">Công ty Đại Dũng</p>
            </div>
          )}
        </div>
        <nav aria-label="Menu chính" className="mt-1 flex flex-col gap-1">
          {(isAdmin ? [...ITEMS, ...ADMIN_ITEMS] : ITEMS).map((i) => {
            const count = i.to === '/nguoi-dung' ? pending : 0
            return (
              <NavLink key={i.to} to={i.to} end={i.end} className={link} onClick={() => setDrawer(false)}
                {...hint(count ? `${i.label} (${count} chờ duyệt)` : i.label)}>
                <Icon name={i.icon} />
                {showLabels && <span>{i.label}</span>}
                {count > 0 && (
                  <span className={showLabels ? 'ml-auto rounded-full bg-orange-500 px-2 text-xs font-bold text-white' : 'sr-only'} data-testid="pending-badge" title={`${count} tài khoản chờ duyệt`}>{count}</span>
                )}
              </NavLink>
            )
          })}
        </nav>
        <div className="mt-auto space-y-1 border-t border-white/10 pt-2">
          <button onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            className={`${row} hidden w-full border-transparent text-slate-300 hover:bg-white/10 hover:text-white md:flex`} data-testid="toggle-sidebar">
            <Icon name={collapsed ? 'expand' : 'collapse'} />
            {collapsed ? null : <span>Thu gọn</span>}
          </button>
          {showLabels && (
            <div className="flex items-center gap-2 px-2 py-1" data-testid="user-chip">
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">{(displayName[0] ?? '?').toLocaleUpperCase('vi')}</span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm text-slate-100" data-testid="user-name" title={displayName}>{displayName}</p>
                {profile && <span className={`mt-0.5 inline-block rounded px-1.5 text-xs font-medium ${profile.role === 'root' ? 'bg-amber-400 font-bold text-slate-900' : 'bg-white/15 text-slate-200'}`} data-testid="user-role">{ROLE_LABEL[profile.role]}</span>}
              </div>
            </div>
          )}
          <button className={`${row} w-full border-transparent text-slate-300 hover:bg-primary hover:text-white`} onClick={() => supabase.auth.signOut()} {...hint('Đăng xuất')}>
            <Icon name="logout" />{showLabels && <span>Đăng xuất</span>}
          </button>
        </div>
      </aside>

      <main id="noi-dung" className="min-w-0 flex-1 p-3 md:flex md:min-h-0 md:flex-col md:overflow-y-auto md:p-6 print:block print:overflow-visible print:p-0">
        <Outlet />
      </main>
    </div>
  )
}

/** Đăng nhập được nhưng không có hồ sơ hoặc bị khóa → thông báo + Đăng xuất (RLS cũng chặn mọi dữ liệu). */
export function AccessGate({ email }: { email: string }) {
  const { profile, loading, error } = useProfile()
  if (loading) return <p className="p-4 text-muted" role="status">Đang tải...</p>
  if (!profile || !profile.is_active) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-4">
        <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 text-center shadow-xl" role="alert" data-testid="access-denied">
          <h1 className="text-lg font-bold">{profile ? 'Tài khoản đã bị khóa' : 'Chưa có quyền truy cập'}</h1>
          <p className="text-gray-700">
            {profile ? 'Tài khoản này đã bị khóa. Vui lòng liên hệ admin.' : error ? `Không đọc được hồ sơ người dùng: ${error}` : 'Tài khoản này chưa được cấp hồ sơ người dùng. Vui lòng liên hệ admin.'}
          </p>
          <Button variant="primary" onClick={() => supabase.auth.signOut()} data-testid="access-signout">Đăng xuất</Button>
        </div>
      </div>
    )
  }
  return <Layout email={email} />
}

export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useProfile()
  if (loading) return null
  return isAdmin ? children : <Navigate to="/" replace />
}

export default function App() {
  const session = useSession()
  if (session === undefined) return <p className="p-4 text-muted" role="status">Đang tải...</p>
  const routes = (
    <Routes>
      <Route path="/dang-nhap" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/dang-ky" element={session ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route element={session ? <AccessGate email={session.user.email ?? ''} /> : <Navigate to="/dang-nhap" replace />}>
        <Route path="/" element={<PlansPage />} />
        <Route path="/bang-kiem" element={<InspectionPage />} />
        <Route path="/in-thong-ke" element={<PrintPage />} />
        <Route path="/danh-muc" element={<LookupsPage />} />
        <Route path="/luong-cong-viec" element={<WorkflowPage />} />
        <Route path="/gioi-thieu" element={<AboutPage />} />
        <Route path="/nguoi-dung" element={<AdminOnly><UsersPage /></AdminOnly>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
  return session ? <ProfileProvider userId={session.user.id}>{routes}</ProfileProvider> : routes
}
