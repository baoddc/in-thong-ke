import { useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useSession } from './lib/useSession'
import Icon, { type IconName } from './components/ui/Icon'
import LoginPage from './pages/LoginPage'
import PlansPage from './pages/PlansPage'
import InspectionPage from './pages/InspectionPage'
import PrintPage from './pages/PrintPage'
import LookupsPage from './pages/LookupsPage'
import WorkflowPage from './pages/WorkflowPage'

const STORAGE_KEY = 'sidebar-collapsed'

const ITEMS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Nhập phiếu', icon: 'plan', end: true },
  { to: '/bang-kiem', label: 'Bảng kiểm', icon: 'inspection' },
  { to: '/in-thong-ke', label: 'In thống kê', icon: 'print' },
  { to: '/danh-muc', label: 'Danh mục', icon: 'lookup' },
  { to: '/luong-cong-viec', label: 'Luồng công việc', icon: 'workflow' },
]

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
    <div className="min-h-screen bg-surface text-gray-900 md:flex">
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
          {ITEMS.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className={link} onClick={() => setDrawer(false)} {...hint(i.label)}>
              <Icon name={i.icon} />{showLabels && <span>{i.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-1 border-t border-white/10 pt-2">
          <button onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            className={`${row} hidden w-full border-transparent text-slate-300 hover:bg-white/10 hover:text-white md:flex`} data-testid="toggle-sidebar">
            <Icon name={collapsed ? 'expand' : 'collapse'} />
            {collapsed ? null : <span>Thu gọn</span>}
          </button>
          {showLabels && (
            <div className="flex items-center gap-2 px-2 py-1" data-testid="user-chip">
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">{(email[0] ?? '?').toLocaleUpperCase('vi')}</span>
              <p className="truncate text-sm text-slate-300" data-testid="user-email">{email}</p>
            </div>
          )}
          <button className={`${row} w-full border-transparent text-slate-300 hover:bg-primary hover:text-white`} onClick={() => supabase.auth.signOut()} {...hint('Đăng xuất')}>
            <Icon name="logout" />{showLabels && <span>Đăng xuất</span>}
          </button>
        </div>
      </aside>

      <main id="noi-dung" className="min-w-0 flex-1 p-3 md:p-6 print:p-0">
        <Outlet />
      </main>
    </div>
  )
}

export default function App() {
  const session = useSession()
  if (session === undefined) return <p className="p-4 text-muted" role="status">Đang tải...</p>
  return (
    <Routes>
      <Route path="/dang-nhap" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={session ? <Layout email={session.user.email ?? ''} /> : <Navigate to="/dang-nhap" replace />}>
        <Route path="/" element={<PlansPage />} />
        <Route path="/bang-kiem" element={<InspectionPage />} />
        <Route path="/in-thong-ke" element={<PrintPage />} />
        <Route path="/danh-muc" element={<LookupsPage />} />
        <Route path="/luong-cong-viec" element={<WorkflowPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
