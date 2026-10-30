import { formatDate } from '../lib/format'
import { pickShipper } from '../lib/plans'
import { carrierList, countSlips, formatDateTime, formatFixed2, shipperList, sumField } from '../lib/printSummary'
import type { PlanRow } from '../types/plan'
import type { InspectionRow } from '../types/inspection'

const HEADERS = ['', 'Ngày', 'Số phiếu xuất kho', 'Loại hình xuất', 'Mã CT', 'Tên công trình', 'Hạng mục', 'Đơn vị Nhận/ Gia Công', 'ĐVT', 'Số lượng', 'Khối lượng (kg)', 'Mặt hàng', 'Ghi chú']
const WIDTHS = [3, 7, 8, 9, 7, 17, 7, 8, 4, 6, 8, 9, 7] // % bề rộng cột, tổng 100
const cell = 'border border-gray-500 px-0.5 py-0.5 align-middle break-words'
const blue = 'text-blue-900'

// Bản in "Thống kê bàn giao phiếu xuất kho" theo mẫu mau-phieu-in.pdf (A4 đứng, vùng in 194mm).
export default function PrintSheet({ plan, rows }: { plan: PlanRow; rows: InspectionRow[] }) {
  const shipper = (shipperList(rows) || pickShipper(plan)).toUpperCase()
  const driver = (plan.driver?.name ?? '').toUpperCase()
  const info = (label: string, value: string, id: string) => (
    <p>{label} <b data-testid={id}>{value}</b></p>
  )

  return (
    <div className="print-sheet bg-white text-black text-[8pt] leading-snug p-4 w-[194mm] min-w-[194mm] print:p-0 print:w-full print:min-w-0" data-testid="print-sheet">
      <img src="/header-daidung.png" alt="Công ty Cổ phần Cơ khí Xây dựng Thương mại Đại Dũng" className="block w-full h-auto" data-testid="print-header" />

      <p className="mt-2 text-[8pt] font-bold">Số phiếu: <span data-testid="print-tk">{plan.tk_number}</span></p>
      <h2 className={`my-2 text-center text-[14pt] font-bold ${blue}`}>THỐNG KÊ BÀN GIAO PHIẾU XUẤT KHO</h2>

      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mb-2 text-[8pt]">
        <div>
          {info('Ngày lập:', formatDateTime(plan.created_at), 'print-created')}
          {info('Số xe:', plan.vehicle?.name ?? '', 'print-vehicle')}
          {info('Số lệnh VC:', plan.transport_order_no ?? '', 'print-order')}
        </div>
        <div>
          {info('Tài xế, Phụ xe:', driver, 'print-driver')}
          {info('Nhà Xe:', carrierList(rows), 'print-carrier')}
          {info('Tổng số phiếu:', String(countSlips(rows)), 'print-slips')}
        </div>
      </div>

      <table className="w-full table-fixed border-collapse text-[7.5pt] leading-tight" data-testid="print-table">
        <colgroup>{WIDTHS.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
        <thead>
          <tr>{HEADERS.map((h, i) => <th key={i} className={`${cell} bg-green-100 ${blue} text-[7pt] font-bold text-center`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="break-inside-avoid" data-testid={`print-row-${r.id}`}>
              <td className={`${cell} text-center`}>{i + 1}</td>
              <td className={`${cell} text-center`}>{formatDate(r.export_date)}</td>
              <td className={`${cell} text-center break-words`}>{r.warehouse_slip_no}</td>
              <td className={`${cell} text-center`}>{r.export_type_name}</td>
              <td className={`${cell} text-center break-words`}>{r.construction_code}</td>
              <td className={`${cell} break-words`}>{r.construction_name}</td>
              <td className={`${cell} break-words`}>{r.work_item}</td>
              <td className={`${cell} text-center`}>{r.receiving_unit_name}</td>
              <td className={`${cell} text-center`}>{r.unit_name}</td>
              <td className={`${cell} text-center`}>{formatFixed2(r.quantity)}</td>
              <td className={`${cell} text-center`}>{formatFixed2(r.total_weight_kg)}</td>
              <td className={`${cell} text-center`}>{r.product_name}</td>
              <td className={`${cell} break-words`}>{r.note}</td>
            </tr>
          ))}
          <tr className="break-inside-avoid h-8">
            <td colSpan={8} className={`${cell} text-center text-[8pt] font-bold`}>TỔNG KHỐI LƯỢNG PHIẾU XUẤT:</td>
            <td className={cell} />
            <td className={`${cell} text-center font-bold`} data-testid="print-total-qty">{formatFixed2(sumField(rows, 'quantity'))}</td>
            <td className={`${cell} text-center font-bold`} data-testid="print-total-weight">{formatFixed2(sumField(rows, 'total_weight_kg'))}</td>
            <td colSpan={2} className={cell} />
          </tr>
          <tr className="break-inside-avoid h-8">
            <td colSpan={8} className={`${cell} text-center text-[8pt] font-bold`}>KHỐI LƯỢNG THEO PHIẾU CÂN:</td>
            <td className={cell} /><td className={cell} /><td className={cell} /><td colSpan={2} className={cell} />
          </tr>
        </tbody>
      </table>

      <div className="break-inside-avoid border border-gray-500 border-t-0 text-[8pt]">
        <div className="h-16 px-1 pt-0.5 flex flex-col">
          <p>Nhân Viên xuất kho cam kết xác nhận xuất kho Vật tư, hàng hóa ĐẦY ĐỦ &amp; ĐÚNG với Phiếu xuất kho</p>
          <p className="mt-auto text-right pr-16 text-[9pt] font-bold" data-testid="print-shipper">{shipper}</p>
        </div>
        <div className="h-16 px-1 pt-0.5 flex flex-col border-t border-gray-500">
          <p>Tài xế, Phụ xe cam kết xác nhận đã nhận Vật tư, hàng hóa ĐẦY ĐỦ &amp; ĐÚNG với Phiếu xuất kho</p>
          <p>Tài xế, Phụ xe xác nhận đã nhận bàn giao đầy đủ Phiếu xuất kho từ Nhân viên kho</p>
          <p className="mt-auto text-right pr-16 text-[9pt] font-bold">{driver}</p>
        </div>
        <div className="px-1 py-0.5 border-t border-gray-500">
          <p>Ghi chú:</p>
          <p>Tất cả hàng hóa mới 100%, bốc lên xe không cong vênh móp méo, không rách, ẩm ướt</p>
          <p>Yêu cầu bên nhận hàng kiểm tra số lượng phiếu xuất, số lượng hàng hóa và ký nhận vào phiếu xuất kho</p>
          <p>Mọi khiếu nại về hàng hóa phải phản hồi cho BPK DDC AH trong vòng 24h kể từ khi nhận hàng</p>
        </div>
      </div>
    </div>
  )
}
