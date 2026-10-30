import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/ui/PageHeader'
import Icon, { type IconName } from '../components/ui/Icon'

type Feature = { icon: IconName; color: string; title: string; points: string[] }
type FeatureGroup = { id: string; title: string; features: Feature[] }

const STATS = [
  { value: '~22.000', label: 'phiếu thống kê đã nạp' },
  { value: '~42.000', label: 'dòng bảng kiểm' },
  { value: '246.043.357,56', label: 'kg đã đối chiếu khớp' },
  { value: 'Tích tắc', label: 'mở trang dù dữ liệu lớn' },
]

const STEPS = [
  { to: '/', title: 'Nhập phiếu', desc: 'Tạo phiếu thống kê, số TK tự cấp.' },
  { to: '/bang-kiem', title: 'Bảng kiểm', desc: 'Nhập từng mặt hàng của phiếu.' },
  { to: '/in-thong-ke', title: 'In thống kê', desc: 'Chọn phiếu, in A4 hoặc lưu PDF.' },
  { to: '/', title: 'Yêu cầu sửa', desc: 'Quá 24 giờ: bấm "Yêu cầu sửa" ở dòng cần sửa.' },
]

const GROUPS: FeatureGroup[] = [
  {
    id: 'nhap-lieu', title: 'Nhập liệu',
    features: [
      {
        icon: 'plan', color: 'bg-red-50 text-red-700', title: 'Nhập phiếu thống kê',
        points: [
          'Số phiếu TK tự cấp dạng TK2026/10-005, tự lấp số khuyết, không bao giờ trùng.',
          'Chọn Phân loại VC, Số xe, Tài xế, NV xuất TP/BTP; NV xuất VT chọn nhiều, giữ thứ tự.',
          'Gõ để tìm không cần dấu; chưa có thì bấm "+ Thêm" ngay.',
        ],
      },
      {
        icon: 'calendar', color: 'bg-yellow-50 text-yellow-700', title: 'Giữ chỗ số phiếu TK',
        points: [
          'Mở form thêm phiếu là số TK được giữ cho riêng bạn trong 5 phút.',
          'Nhiều người cùng tạo phiếu vẫn không bị trùng số; mở lại khi còn hạn thì giữ đúng số cũ.',
        ],
      },
      {
        icon: 'inspection', color: 'bg-emerald-50 text-emerald-700', title: 'Bảng kiểm chi tiết',
        points: [
          'Mỗi dòng là 1 mặt hàng trên 1 phiếu xuất kho.',
          'Số lệnh VC, Số xe, Tài xế, NV xuất hàng tự lấy theo số phiếu TK.',
          'Nhập Mã công trình tự điền Tên công trình.',
          '"Lưu và thêm dòng tiếp" giữ lại phần chung.',
        ],
      },
      {
        icon: 'lookup', color: 'bg-teal-50 text-teal-700', title: 'Danh mục chuẩn hóa',
        points: [
          'Phân loại VC, xe, tài xế, NV xuất, công trình (mã + tên), đơn vị giao/nhận, loại hình xuất, mặt hàng, ĐVT, nhà xe.',
          'Sắp theo số tự nhiên (1, 2, … 10); chống trùng tên.',
        ],
      },
    ],
  },
  {
    id: 'in-tra-cuu', title: 'In & tra cứu',
    features: [
      {
        icon: 'print', color: 'bg-sky-50 text-sky-700', title: 'In thống kê',
        points: [
          'Mẫu "Thống kê bàn giao phiếu xuất kho" khổ A4, có logo Đại Dũng.',
          'Tự cộng tổng số lượng, khối lượng và tổng số phiếu.',
          'In hoặc lưu PDF ngay từ trình duyệt.',
        ],
      },
      {
        icon: 'search', color: 'bg-violet-50 text-violet-700', title: 'Tra cứu nhanh dữ liệu lớn',
        points: [
          'Tìm theo số TK, số lệnh VC, số phiếu xuất kho.',
          'Lọc theo khoảng ngày, loại hình xuất, mặt hàng, công trình, đơn vị nhận; sắp theo cột, phân trang.',
          'Thiết kế cho hàng trăm nghìn đến hàng triệu dòng vẫn mở trang trong tích tắc.',
        ],
      },
      {
        icon: 'scale', color: 'bg-amber-50 text-amber-700', title: 'Số liệu tức thì',
        points: [
          'Thẻ số phiếu, số dòng bảng kiểm và tổng khối lượng (kg) của tháng.',
          'Thống kê được tính sẵn trong cơ sở dữ liệu.',
        ],
      },
      {
        icon: 'file', color: 'bg-orange-50 text-orange-700', title: 'Dữ liệu chuyển từ Google Sheets',
        points: [
          'Đã nạp ~22.000 phiếu và ~42.000 dòng bảng kiểm từ Kho An Hạ.',
          'Chuẩn hóa danh mục, sửa ngày bị đảo.',
          'Đối chiếu tổng khối lượng khớp 246.043.357,56 kg.',
        ],
      },
    ],
  },
  {
    id: 'quan-tri', title: 'Quản trị & an toàn',
    features: [
      {
        icon: 'shield', color: 'bg-rose-50 text-rose-700', title: 'Phân quyền & an toàn',
        points: [
          '3 vai trò: Root / Admin / Người dùng.',
          'Người tạo được sửa/xóa dữ liệu của mình trong 24 giờ, sau đó chỉ admin.',
          'Dữ liệu được bảo vệ ở tầng cơ sở dữ liệu (RLS); mọi thao tác ghi lại người tạo và người sửa lần cuối.',
        ],
      },
      {
        icon: 'edit', color: 'bg-pink-50 text-pink-700', title: 'Yêu cầu sửa sau 24 giờ',
        points: [
          'Phiếu hoặc dòng bảng kiểm quá 24 giờ: người tạo bấm "Yêu cầu sửa" kèm lý do.',
          'Admin/Root duyệt thì được sửa (không xóa) trong 24 giờ.',
          'Thông báo tức thì: admin thấy yêu cầu mới và người yêu cầu thấy kết quả duyệt/từ chối ngay, không cần tải lại trang.',
        ],
      },
      {
        icon: 'user', color: 'bg-indigo-50 text-indigo-700', title: 'Tài khoản',
        points: [
          'Đăng nhập bằng tên đăng nhập (vd bao.lt) hoặc email.',
          'Tự đăng ký và chờ quản trị viên duyệt.',
          'Quản trị viên tạo tài khoản, khóa/mở khóa, đặt lại mật khẩu.',
        ],
      },
    ],
  },
]

// true = được, false = không, chuỗi = được kèm điều kiện
type Cell = boolean | string
const ROLES = ['Root', 'Admin', 'Người dùng'] as const
const PERMISSIONS: { label: string; cells: [Cell, Cell, Cell] }[] = [
  { label: 'Xem dữ liệu', cells: [true, true, true] },
  { label: 'Nhập phiếu, bảng kiểm', cells: [true, true, true] },
  { label: 'Sửa/xóa trong 24 giờ', cells: [true, true, 'Của mình'] },
  { label: 'Sửa sau 24 giờ', cells: [true, true, 'Sau khi duyệt'] },
  { label: 'Duyệt yêu cầu sửa', cells: [true, true, false] },
  { label: 'Quản lý tài khoản', cells: [true, 'Người dùng', false] },
  { label: 'Quản lý admin', cells: [true, false, false] },
]

function PermissionCell({ value }: { value: Cell }) {
  if (typeof value === 'string') return <span className="text-xs font-medium text-amber-800">{value}</span>
  return value
    ? <span className="inline-flex text-success" role="img" aria-label="Được"><Icon name="check" size={18} /></span>
    : <span className="text-gray-400" role="img" aria-label="Không">—</span>
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-stone-300 border-b-2 bg-stone-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-gray-800">{children}</kbd>
}

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return <h2 id={id} className="text-base font-bold text-gray-900">{children}</h2>
}

export default function AboutPage() {
  return (
    <div className="space-y-5" data-testid="about-page">
      <PageHeader title="Giới thiệu" />

      <section className="overflow-hidden rounded-card border border-stone-200 bg-white shadow-card" data-testid="about-hero">
        <div className="h-1 bg-primary-brand" aria-hidden="true" />
        <div className="p-4">
          <div className="flex items-start gap-3 sm:items-center">
            <img src="/logo-daidung.png" alt="Đại Dũng" className="h-12 w-auto shrink-0" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900">In thống kê — Kho An Hạ</h2>
              <p className="mt-1 text-gray-700">
                Nhập phiếu thống kê vận chuyển, bảng kiểm chi tiết phiếu xuất kho và in phiếu bàn giao cho Kho An Hạ — Công ty Cổ phần Cơ khí Xây dựng Thương mại Đại Dũng.
              </p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="about-stats">
            {STATS.map((s) => (
              <div key={s.label} className="min-w-0 rounded-lg border border-primary-line bg-primary-soft px-3 py-2" data-testid="stat-tile">
                <dd className="truncate text-lg font-bold text-primary">{s.value}</dd>
                <dt className="text-xs text-gray-700">{s.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="about-quick-start" className="space-y-2" data-testid="about-steps">
        <SectionTitle id="about-quick-start">Bắt đầu nhanh</SectionTitle>
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Link
                to={s.to}
                data-testid="step-link"
                className="flex h-full items-start gap-3 rounded-card border border-stone-200 bg-white p-3 shadow-card transition hover:border-primary-line hover:bg-primary-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white" aria-hidden="true">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block font-semibold text-gray-900">{s.title}</span>
                  <span className="block text-sm text-gray-700">{s.desc}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {GROUPS.map((g) => (
        <section key={g.id} aria-labelledby={`about-${g.id}`} className="space-y-2" data-testid="feature-group">
          <SectionTitle id={`about-${g.id}`}>{g.title}</SectionTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="feature-grid">
            {g.features.map((f) => (
              <article key={f.title} className="rounded-card border border-stone-200 bg-white p-4 shadow-card" data-testid="feature-card">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${f.color}`}><Icon name={f.icon} /></span>
                  <h3 className="font-semibold text-gray-900">{f.title}</h3>
                </div>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  {f.points.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section aria-labelledby="about-roles" className="space-y-2" data-testid="about-roles">
        <SectionTitle id="about-roles">Ai được làm gì</SectionTitle>
        <div className="overflow-x-auto rounded-card border border-stone-200 bg-white shadow-card">
          <table className="w-full min-w-[20rem] text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-left text-gray-800">
                <th scope="col" className="px-3 py-2 font-semibold">Thao tác</th>
                {ROLES.map((r) => <th key={r} scope="col" className="px-2 py-2 text-center font-semibold">{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p.label} className="border-b border-stone-100 last:border-0" data-testid="role-row">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-gray-900">{p.label}</th>
                  {p.cells.map((c, i) => (
                    <td key={ROLES[i]} className="px-2 py-2 text-center align-middle"><PermissionCell value={c} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="about-ui" className="space-y-2" data-testid="about-shortcuts">
        <SectionTitle id="about-ui">Phím tắt & định dạng</SectionTitle>
        <div className="rounded-card border border-stone-200 bg-white p-4 text-sm text-gray-700 shadow-card">
          <ul className="space-y-2">
            <li><Kbd>N</Kbd> thêm mới</li>
            <li><Kbd>/</Kbd> tìm kiếm</li>
            <li><Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> lưu</li>
          </ul>
          <p className="mt-3">Ngày dạng dd/mm/yyyy, số kiểu Việt Nam 1.234,5. Chữ gọn, bảng hiển thị nhiều dòng; ẩn/hiện bộ lọc và số liệu, menu thu gọn, dùng tốt trên điện thoại.</p>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted">
        <p>Phiên bản 30/10/2026</p>
        <Link to="/luong-cong-viec" data-testid="workflow-link" className="font-medium text-primary underline underline-offset-2 hover:text-primary-dark">Xem trang Luồng công việc</Link>
      </footer>
    </div>
  )
}
