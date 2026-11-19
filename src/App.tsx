import LoadingScreen from './components/ui/LoadingScreen'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useSession } from './lib/useSession'
import Icon, { type IconName } from './components/ui/Icon'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import { usePendingCount } from './lib/useAdminUsers'
import { useEditPendingCount } from './lib/useEditRequests'
import { useEditRequestNotices } from './lib/useEditRequestNotices'
import IncompleteNotice from './components/IncompleteNotice'
import EditRequestsPage from './pages/EditRequestsPage'
import PlansPage from './pages/PlansPage'
import InspectionPage from './pages/InspectionPage'
import PrintPage from './pages/PrintPage'
import LookupsPage from './pages/LookupsPage'
import ReportPage from './pages/ReportPage'
import WorkflowPage from './pages/WorkflowPage'
import GuidePage from './pages/GuidePage'
import LicensePage from './pages/LicensePage'
import AboutPage from './pages/AboutPage'
import UsersPage from './pages/UsersPage'
import AuditLogPage from './pages/AuditLogPage'
import { ProfileProvider, useProfile } from './lib/useProfile'
import { ROLE_LABEL } from './lib/auth'
import Button from './components/ui/Button'
import Avatar from './components/ui/Avatar'
import AvatarDialog from './components/AvatarDialog'
import { PresenceProvider } from './lib/presence'
import { OnlineUsers } from './components/PresenceViews'

const STORAGE_KEY = 'sidebar-collapsed'

type NavItem = { to: string; label: string; icon: IconName; end?: boolean }
const ITEMS: NavItem[] = [
  { to: '/', label: 'Nhập phiếu', icon: 'plan', end: true },
  { to: '/bang-kiem', label: 'Bảng kiểm', icon: 'inspection' },
  { to: '/in-thong-ke', label: 'In thống kê', icon: 'print' },
  { to: '/bao-cao', label: 'Báo cáo', icon: 'scale' },
  { to: '/danh-muc', label: 'Danh mục', icon: 'lookup' },
  { to: '/luong-cong-viec', label: 'Luồng công việc', icon: 'workflow' },
]
const HELP_ITEMS: NavItem[] = [ // nhóm "Trợ giúp"
  { to: '/gioi-thieu', label: 'Giới thiệu', icon: 'info' },
  { to: '/huong-dan', label: 'Hướng dẫn sử dụng', icon: 'file' },
]
const ADMIN_ITEMS: NavItem[] = [ // D-013/D-014: admin và root
  { to: '/yeu-cau-sua', label: 'Yêu cầu sửa', icon: 'edit' }, // D-019
  { to: '/nguoi-dung', label: 'Quản lý người dùng', icon: 'user' },
]
const ROOT_ITEMS: NavItem[] = [{ to: '/lich-su-thao-tac', label: 'Lịch sử thao tác', icon: 'shield' }] // T-085

function readCollapsed() {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

/** Ô vuông trắng chứa biểu tượng Đại Dũng (cắt từ ảnh header) — nổi trên nền tối. */
function LogoTile({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center ${className}`}>
      <img src="/logo-daidung.png" alt="Đại Dũng" className="max-h-full max-w-full object-contain" />
    </span>
  )
}

export function Layout({ email }: { email: string }) {
  return <PresenceProvider><LayoutBody email={email} /></PresenceProvider> // D-024
}

function LayoutBody({ email }: { email: string }) {
  const { pathname } = useLocation() // key của <main>: đổi trang thì chạy lại hiệu ứng mờ dần, đổi bộ lọc (?query) thì không
  const { profile, isAdmin, isRoot } = useProfile()
  const displayName = profile?.full_name || email
  const pending = usePendingCount(isAdmin) // D-015: badge số tài khoản chờ duyệt
  const pendingEdits = useEditPendingCount(isAdmin) // D-019: badge số yêu cầu sửa chờ duyệt
  useEditRequestNotices(profile?.id, isAdmin) // D-020: thông báo tức thì khi yêu cầu sửa được duyệt/từ chối
  // Mặc định gập cả hai nhóm; chỉ mở sẵn nhóm chứa trang đang xem.
  const [openGroups, setOpenGroups] = useState(() => ({ help: HELP_ITEMS.some((i) => i.to === pathname), admin: [...ADMIN_ITEMS, ...ROOT_ITEMS].some((i) => i.to === pathname) }))
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawer, setDrawer] = useState(false) // ngăn kéo trên màn hình nhỏ
  const [avatarOpen, setAvatarOpen] = useState(false)
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

  // Sidebar kính mờ trên nền tối: mục đang chọn = viên kính sáng nổi có viền mảnh, chữ trắng (tương phản cao trên nền tối).
  const row = `flex min-h-[48px] items-center gap-3 rounded-xl border py-2 md:min-h-10 [@media(max-height:820px)]:md:min-h-8 [@media(max-height:820px)]:md:py-1 whitespace-nowrap transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${showLabels ? 'px-3' : 'justify-center'}`
  const link = ({ isActive }: { isActive: boolean }) =>
    `${row} ${isActive ? 'glass-active font-semibold text-white' : 'border-transparent text-slate-200 hover:bg-white/10 hover:text-white'}`
  // Mục con (như mẫu): không icon, chữ nhỏ hơn, chấm tròn trên đường nối dọc bên trái; mục đang chọn sáng lên.
  const subLink = ({ isActive }: { isActive: boolean }) =>
    `relative flex min-h-10 items-center gap-2 rounded-lg border py-1.5 pl-7 pr-2 text-[13px] whitespace-nowrap transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${isActive ? 'border-transparent bg-white/10 font-semibold text-white' : 'border-transparent text-slate-300 hover:bg-white/10 hover:text-white'}`
  const hint = (text: string) => (showLabels ? {} : { title: text, 'aria-label': text })

  const groupItems = [...(isAdmin ? ADMIN_ITEMS : []), ...(isRoot ? ROOT_ITEMS : [])] // gom vào mục "Admin" trên menu
  const renderItem = (i: NavItem, sub = false, last = false) => {
    const Tree = () => sub ? (
      // Nhánh cây như mẫu: đường dọc từ icon cha, cong ở chân rồi tới chấm tròn trước chữ.
      <>
        <span aria-hidden="true" className="pointer-events-none absolute -left-px -top-px h-[calc(50%+1px)] w-3 rounded-bl-xl border-b border-l border-white/40" />
        {!last && <span aria-hidden="true" className="pointer-events-none absolute -left-px top-1/2 -bottom-px border-l border-white/40" />}
        <span aria-hidden="true" className="pointer-events-none absolute left-[15px] top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-white/70" />
      </>
    ) : <Icon name={i.icon} />
    const isEdits = i.to === '/yeu-cau-sua'
    const count = isEdits ? pendingEdits : i.to === '/nguoi-dung' ? pending : 0
  const what = isEdits ? 'yêu cầu' : 'tài khoản'
  return (
    <NavLink key={i.to} to={i.to} end={i.end} className={sub ? subLink : link} onClick={() => setDrawer(false)}
      {...hint(count ? `${i.label} (${count} chờ duyệt)` : i.label)}>
      <Tree />
      {showLabels && <span>{i.label}</span>}
      {count > 0 && (
        <span className={showLabels ? 'ml-auto rounded-full bg-orange-500 px-2 text-xs font-bold text-white' : 'sr-only'} data-testid={isEdits ? 'edit-pending-badge' : 'pending-badge'} title={`${count} ${what} chờ duyệt`}>{count}</span>
      )}
    </NavLink>
  )
  }

  // Nhóm mục con gập được (Trợ giúp, Admin). Menu thu gọn (chỉ icon): bỏ tiêu đề nhóm, hiện phẳng các icon.
  const renderGroup = (id: 'help' | 'admin', label: string, icon: IconName, items: NavItem[], badge: number) => {
    if (items.length === 0) return null
    const open = openGroups[id]
    return (
      <>
        <button type="button" onClick={() => setOpenGroups((g) => ({ ...g, [id]: !g[id] }))} aria-expanded={open} aria-controls={`nav-${id}`} data-testid={`nav-${id}-toggle`}
          className={`${row} w-full border-transparent text-slate-200 hover:bg-white/10 hover:text-white ${showLabels ? '' : 'hidden'}`}>
          <Icon name={icon} />
          <span>{label}</span>
          {!open && badge > 0 && <span className="ml-auto rounded-full bg-orange-500 px-2 text-xs font-bold text-white" title="Có mục chờ duyệt">{badge}</span>}
          <Icon name="next" size={16} className={`${!open && badge > 0 ? '' : 'ml-auto'} opacity-60 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        {(open || !showLabels) && (
          <div id={`nav-${id}`} className={`flex flex-col ${showLabels ? '-mt-1 ml-[22px]' : 'gap-0.5'}`}>
            {items.map((i, k) => renderItem(i, showLabels, k === items.length - 1))}
          </div>
        )}
      </>
    )
  }

  return (
    // Từ md: khung đúng bằng màn hình, không cuộn cả trang — bảng tự cuộn bên trong; khi in thì trả về dòng chảy bình thường.
    <div className="min-h-screen bg-surface text-gray-900 md:app-bg md:flex md:h-dvh md:min-h-0 md:gap-3 md:overflow-hidden md:p-3 print:block print:h-auto print:overflow-visible print:bg-transparent print:p-0">
      <header className="sticky top-0 z-20 md:hidden print:hidden flex items-center gap-3 border-b-2 border-primary-brand bg-white p-2 shadow-sm">
        <button onClick={() => setDrawer(true)} aria-label="Mở menu" className="flex h-[44px] w-[44px] items-center justify-center rounded-lg border border-line transition duration-150 hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="open-drawer">
          <Icon name="menu" />
        </button>
        <img src="/logo-daidung.png" alt="" className="h-8 w-auto" />
        <span className="font-bold leading-tight">Kho An Hạ <span className="block text-xs font-normal text-muted">Công ty Đại Dũng</span></span>
      </header>

      {drawer && <div className="fixed inset-0 z-30 animate-fade-in bg-slate-900/50 md:hidden print:hidden" onClick={() => setDrawer(false)} data-testid="drawer-overlay" />}

      <aside className={`print:hidden glass fixed inset-y-2 left-2 z-40 flex w-72 max-w-[85vw] flex-col overflow-y-auto rounded-3xl p-3 text-slate-100 transition-all duration-200 md:static md:h-full md:shrink-0 md:translate-x-0 md:overflow-y-auto md:visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${collapsed ? 'md:w-16' : 'md:w-64'} ${drawer ? 'translate-x-0' : '-translate-x-[110%] invisible'}`}>
        <div className={`flex items-center gap-2 px-1 pb-1 pt-0 ${showLabels ? '' : 'justify-center'}`} data-testid="brand">
          <LogoTile className={showLabels ? 'h-8 w-8' : 'h-8 w-8'} />
          {showLabels && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold text-white">Kho An Hạ</p>
              <p className="truncate text-[11px] text-slate-400">Công ty Đại Dũng</p>
            </div>
          )}
        </div>
        {showLabels && (
          <div className="flex items-center gap-2 glass-card p-1.5" data-testid="user-chip">
            {profile
              ? (
                <button type="button" onClick={() => setAvatarOpen(true)} title="Đổi ảnh đại diện" aria-label="Đổi ảnh đại diện" data-testid="avatar-button"
                  className="shrink-0 rounded-full transition duration-150 hover:ring-2 hover:ring-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                  <Avatar name={displayName} path={profile.avatar_path} />
                </button>
              )
              : <Avatar name={displayName} />}
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm text-white" data-testid="user-name" title={displayName}>{displayName}</p>
              {profile && <span className={`mt-0.5 inline-block rounded px-1.5 text-xs font-medium ${profile.role === 'root' ? 'bg-amber-400 font-bold text-slate-900' : 'bg-white/20 text-white'}`} data-testid="user-role">{ROLE_LABEL[profile.role]}</span>}
            </div>
          </div>
        )}
        {showLabels && <p className="mt-2 px-2 text-[11px] font-semibold tracking-widest text-slate-300" aria-hidden="true">MENU</p>}
        <nav aria-label="Menu chính" className="mt-1 flex flex-col gap-1 [@media(max-height:820px)]:md:gap-0.5">
          {ITEMS.map((i) => renderItem(i))}
          {renderGroup('help', 'Trợ giúp', 'info', HELP_ITEMS, 0)}
          {renderGroup('admin', 'Admin', 'shield', groupItems, pending + pendingEdits)}
        </nav>
        <div className="mt-auto space-y-1 border-t border-white/10 pt-2">
          <OnlineUsers showLabels={showLabels} />
          <button onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            className={`${row} hidden w-full border-transparent text-slate-200 hover:bg-white/10 hover:text-white md:flex`} data-testid="toggle-sidebar">
            <Icon name={collapsed ? 'expand' : 'collapse'} />
            {collapsed ? null : <span>Thu gọn</span>}
          </button>
          <button className={`${row} w-full border-transparent text-slate-200 hover:bg-primary hover:text-white`} onClick={() => supabase.auth.signOut()} {...hint('Đăng xuất')}>
            <Icon name="logout" />{showLabels && <span>Đăng xuất</span>}
          </button>
          {showLabels && <p className="px-2 pb-1 text-[11px] text-slate-300" data-testid="credit">Phát triển bởi Mr.Storm</p>}
          {showLabels && <p className="-mt-1 px-2 pb-1 text-[11px] text-slate-300" data-testid="license">© 2026 · <NavLink to="/giay-phep" onClick={() => setDrawer(false)} className="underline underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded">Giấy phép MIT</NavLink></p>}
        </div>
      </aside>

      <main key={pathname} id="noi-dung" className="min-w-0 flex-1 animate-fade-in p-3 md:flex md:rounded-3xl md:bg-surface md:min-h-0 md:flex-col md:overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:p-6 print:block print:overflow-visible print:rounded-none print:p-0">
        <IncompleteNotice />
        <Outlet />
      </main>

      {avatarOpen && profile && <AvatarDialog userId={profile.id} name={displayName} path={profile.avatar_path} onClose={() => setAvatarOpen(false)} />}
    </div>
  )
}

/** Đăng nhập được nhưng không có hồ sơ hoặc bị khóa → thông báo + Đăng xuất (RLS cũng chặn mọi dữ liệu). */
export function AccessGate({ email }: { email: string }) {
  const { profile, loading, error } = useProfile()
  if (loading) return <LoadingScreen />
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

export function RootOnly({ children }: { children: ReactNode }) { // T-085: nhật ký thao tác chỉ root
  const { isRoot, loading } = useProfile()
  if (loading) return null
  return isRoot ? children : <Navigate to="/" replace />
}

export default function App() {
  const session = useSession()
  if (session === undefined) return <LoadingScreen />
  const routes = (
    <Routes>
      <Route path="/dang-nhap" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/dang-ky" element={session ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route element={session ? <AccessGate email={session.user.email ?? ''} /> : <Navigate to="/dang-nhap" replace />}>
        <Route path="/" element={<PlansPage />} />
        <Route path="/bang-kiem" element={<InspectionPage />} />
        <Route path="/in-thong-ke" element={<PrintPage />} />
        <Route path="/bao-cao" element={<ReportPage />} />
        <Route path="/danh-muc" element={<LookupsPage />} />
        <Route path="/luong-cong-viec" element={<WorkflowPage />} />
        <Route path="/huong-dan" element={<GuidePage />} />
        <Route path="/giay-phep" element={<LicensePage />} />
        <Route path="/gioi-thieu" element={<AboutPage />} />
        <Route path="/yeu-cau-sua" element={<AdminOnly><EditRequestsPage /></AdminOnly>} />
        <Route path="/nguoi-dung" element={<AdminOnly><UsersPage /></AdminOnly>} />
        <Route path="/lich-su-thao-tac" element={<RootOnly><AuditLogPage /></RootOnly>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
  return session ? <ProfileProvider userId={session.user.id}>{routes}</ProfileProvider> : routes
}
