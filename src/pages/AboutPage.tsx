import PageHeader from '../components/ui/PageHeader'
import Icon, { type IconName } from '../components/ui/Icon'

type Feature = { icon: IconName; color: string; title: string; points: string[] }

const FEATURES: Feature[] = [
  {
    icon: 'plan', color: 'bg-red-50 text-red-700', title: 'Nhập phiếu thống kê',
    points: [
      'Số phiếu TK tự cấp dạng TK2026/10-005, tự lấp số khuyết, không bao giờ trùng.',
      'Chọn Phân loại VC, Số xe, Tài xế, NV xuất TP/BTP; NV xuất VT chọn nhiều, giữ thứ tự.',
      'Gõ để tìm không cần dấu; chưa có thì bấm "+ Thêm" ngay.',
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
    icon: 'lookup', color: 'bg-teal-50 text-teal-700', title: 'Danh mục chuẩn hóa',
    points: [
      'Phân loại VC, xe, tài xế, NV xuất, công trình (mã + tên), đơn vị giao/nhận, loại hình xuất, mặt hàng, ĐVT, nhà xe.',
      'Sắp theo số tự nhiên (1, 2, … 10); chống trùng tên.',
    ],
  },
  {
    icon: 'shield', color: 'bg-rose-50 text-rose-700', title: 'Phân quyền & an toàn',
    points: [
      '3 vai trò: Root / Admin / Người dùng.',
      'Người tạo được sửa/xóa dữ liệu của mình trong 24 giờ, sau đó chỉ admin.',
      'Dữ liệu được bảo vệ ở tầng cơ sở dữ liệu (RLS); mọi thao tác ghi lại người tạo và người sửa lần cuối.',
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
  {
    icon: 'file', color: 'bg-orange-50 text-orange-700', title: 'Dữ liệu chuyển từ Google Sheets',
    points: [
      'Đã nạp ~22.000 phiếu và ~42.000 dòng bảng kiểm từ Kho An Hạ.',
      'Chuẩn hóa danh mục, sửa ngày bị đảo.',
      'Đối chiếu tổng khối lượng khớp 246.043.357,56 kg.',
    ],
  },
  {
    icon: 'menu', color: 'bg-slate-100 text-slate-700', title: 'Giao diện tiện dùng',
    points: [
      'Chữ gọn, bảng hiển thị nhiều dòng; ẩn/hiện bộ lọc và số liệu, menu thu gọn, dùng tốt trên điện thoại.',
      'Phím tắt: N (thêm), / (tìm), Ctrl+Enter (lưu).',
      'Ngày dd/mm/yyyy, số kiểu Việt Nam 1.234,5.',
    ],
  },
]

export default function AboutPage() {
  return (
    <div className="space-y-4" data-testid="about-page">
      <PageHeader title="Giới thiệu" />
      <section className="rounded-card border border-stone-200 bg-white p-4 shadow-card">
        <h2 className="text-lg font-bold text-gray-900">In thống kê — Kho An Hạ</h2>
        <p className="mt-1 text-gray-700">
          Ứng dụng nhập phiếu thống kê vận chuyển, bảng kiểm chi tiết phiếu xuất kho và in phiếu bàn giao cho Kho An Hạ — Công ty Cổ phần Cơ khí Xây dựng Thương mại Đại Dũng.
        </p>
      </section>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="feature-grid">
        {FEATURES.map((f) => (
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
      <p className="text-xs text-muted">Phiên bản 30/10/2026</p>
    </div>
  )
}
