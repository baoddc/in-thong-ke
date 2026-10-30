# Kế hoạch

Supabase project: `in-thong-ke` · ref `sybzvaybffgkgiyvevsp` · ap-southeast-1 · URL `https://sybzvaybffgkgiyvevsp.supabase.co`

## Tính năng 1 — Nhập phiếu kế hoạch phân công (số phiếu TK)

Nguồn yêu cầu: ảnh người dùng gửi 29/10/2026 (tương ứng sheet `01.KE HOACH & KQ`).

| Trường (nhãn) | Cột DB | Cách nhập |
|---|---|---|
| Số phiếu thống kê | `tk_number` | Tự sinh: `TK` + năm hiện tại 4 số + `/` + tháng 2 số + `-` + thứ tự 3 số, vd `TK2026/10-005`. Thứ tự tăng dần trong tháng; nếu có số khuyết (phiếu đã xóa) thì lấy số khuyết nhỏ nhất; tuyệt đối không trùng (D-004) |
| Ngày xuất | `export_date` | chọn ngày |
| Số lệnh VC | `transport_order_no` | gõ tay |
| Phân loại VC | `transport_type_id` | chọn từ danh mục `transport_type` |
| Số xe lấy hàng | `vehicle_id` | chọn từ danh mục `vehicle` |
| Tên tài xế/ phụ xe | `driver_id` | chọn từ danh mục `driver` |
| NV Xuất TP/BTP | `fg_exporter_id` | chọn từ danh mục `fg_exporter` |
| NV Xuất VT | bảng nối `transport_plan_material_exporters` | chọn **nhiều** từ danh mục `material_exporter` |
| Ghi chú | `note` | gõ tay |

Danh mục do người dùng tự nhập trên trang "Danh mục" (D-005).

## Task

| ID | Việc | Agent | Trạng thái |
|---|---|---|---|
| T-001 | Migration: `lookup_items`, `transport_plans`, `transport_plan_material_exporters`, RPC sinh số TK, RLS; `docs/api-contract.md`; `src/types/database.ts` | backend | Xong (file SQL; chưa áp) |
| T-002 | Web React: đăng nhập, trang Nhập phiếu (form + danh sách phiếu, sửa/xóa), trang Danh mục | frontend | Xong code — typecheck/lint/test/build qua; chưa chạy thử với DB thật |
| T-003 | Áp migration lên project, kiểm tra advisor, thử tạo phiếu | Lead | Migration đã áp (người dùng chạy), advisor sạch; chưa thử tạo phiếu |
| T-004 | Nạp danh mục từ `chuan-bi/data.xlsx`; web tải đủ >1000 mục + ô gõ để tìm | Lead / frontend | Đã nạp (vehicle 1414, driver 643, fg 22, vt 22, transport_type 18); FE xong, qua typecheck/lint/test/build |
| T-006 | Combobox gõ để tìm (bỏ dấu) + "Thêm" mục mới cho cả 5 trường; NV xuất VT dạng chip | frontend | Xong — 14 test qua, typecheck/lint/build qua; chưa thử sau đăng nhập trên trình duyệt |
| T-007 | Form phiếu thành modal (`<dialog>`), bảng có Thêm/Sửa/Xóa | frontend | Xong — 17 test qua, typecheck/lint/build qua; chưa xem trên trình duyệt sau đăng nhập |
| T-008 | Đổi mọi `id` uuid → bigint identity (D-007), giữ dữ liệu | backend + frontend | Xong — người dùng chạy migration trong SQL Editor; khối assert cuối lỗi `_mig_counts does not exist` (SQL Editor tự commit từng lệnh nên temp table `on commit drop` mất) nhưng mọi thay đổi đã áp. Lead kiểm tay: 2119/1/1 dòng, sequence = max(id), trigger bật, FK hợp lệ, phiếu TK2026/10-001 trỏ đúng loại danh mục |
| T-009 | Bảng kiểm chi tiết (D-008): bảng `inspection_details` + view + danh mục mới; trang `/bang-kiem` | backend + frontend | Code xong (FE 35 test, typecheck/lint/build qua; Lead đã review SQL, tên check `lookup_items_kind_check` khớp DB thật). Chờ người dùng chạy `20261029000003_inspection_details.sql` |
| T-010 | Nạp `chuan-bi/data2.xlsx`: Công trình (762 mã, mã trùng → giữ tên dòng dưới cùng, 38 tên bỏ ở `chuan-bi/cong-trinh_ten-bi-bo.csv`), Đơn vị nhận hàng 301, Loại hình xuất 12, Mặt hàng 24 | Lead | 3 danh mục đã nạp. Công trình chờ người dùng chạy `chuan-bi/nap-cong-trinh.sql` (có đổi unique index tên → bỏ cho kind construction). TODO backend: thêm migration 000004 cho đổi index này để repo khớp DB |
| T-011 | Danh mục: tab chia 2 nhóm (Phiếu thống kê / Bảng kiểm chi tiết) | frontend | Xong |
| T-012 | Sắp danh mục theo số tự nhiên (Intl.Collator vi, numeric) | frontend | Xong |
| T-013 | Trang In thống kê `/in-thong-ke` theo mẫu `chuan-bi/mau-phieu-in.pdf` (A4 ngang, `?tk=`) | frontend | Xong — 45 test qua; chưa xem in thật trên trình duyệt. Xuất Excel chưa làm |
| T-014 | Sidebar thu gọn/mở rộng, ngăn kéo trên mobile | frontend | Xong — chưa xem 375px thật |
| T-015 | Mọi trang dùng toàn chiều rộng (bỏ max-w-5xl) | frontend | Xong |
| T-016/017 | Bản in A4 đứng (194mm), font Times New Roman, đầu trang = ảnh `public/header-daidung.png`, chữ bảng 7–7,5pt | frontend | Xong — 45 test qua; chưa xem in thật |
| T-018 | NV xuất hàng chọn/sửa được theo dòng (D-010): migration 000004 (`shipper_id` + ghi lại đổi index tên công trình của T-010), FE combobox | backend + frontend | Xong — migration 000004 đã áp (Lead kiểm cột + view), FE 52 test qua; chưa thử trên trình duyệt |
| T-019 | Ô số theo quy tắc VN chặt (`,` thập phân, `.` nghìn) | frontend | Xong — 57 test qua |
| T-020 | Nạp dữ liệu cũ (D-011): làm sạch + bảng đối chiếu + CSV | data-analyst | CSV nháp xong (21.956 phiếu gồm 5.458 tự tạo; 41.799 dòng BK; 13.970 ngày BK đã đảo; tổng 246.043.357,56 kg). Còn 194 dòng BK ngày > 29/10/2026 chưa sửa được. Chờ người dùng duyệt `data/clean/doi-chieu.xlsx` rồi `--build` chính thức |
| T-021 | Migration 000005: plan_id null, tk_seq ≤ 9999, bảng tạm import, `import_ref`; SQL áp dữ liệu | backend + Lead | 000005/000006 đã áp. CSV đã vào bảng tạm (12 dòng hỏng chữ do Dashboard import cắt UTF-8 → Lead sửa lại từ CSV). Bước 1 xong: +1.096 mục danh mục, +165 công trình. XONG 29/10/2026: phiếu TK2026/10-001 ghi đè bằng phiếu thật (UPDATE); nạp 21.955 phiếu + 5.303 NV xuất VT + 41.799 dòng BK (3 đợt). Đối chiếu khớp: 21.956 phiếu, 41.799 dòng (18.112 có phiếu, 23.687 không), 246.043.357,56 kg, 0 mã CT lệch. Tồn: dòng BK thử id 1 (456 kg) đang gắn TK2026/10-001 — người dùng xóa trên web; drop 2 bảng tạm import_* (DDL, người dùng chạy) |
| T-024 | Làm mới giao diện (màu Đại Dũng, sidebar tối, badge, DateInput dd/mm/yyyy) | frontend | Xong — 105 test qua |
| T-025 | Kiểm thử tổng thể + docs/test-report.md | tester | Xong — lint/typecheck/build qua, 173 test; Cao 0, TB 3, Thấp 8. BUG-001 → T-029; BUG-009 → T-028; BUG-002 không phải lỗi với dữ liệu nạp (created_at phiếu nạp = ngày xuất); BUG-003 = CSV đang được tạo lại cho T-026 |
| T-030 | Đo tốc độ | Lead | Tạo branch bị từ chối → đo EXPLAIN ANALYZE trên DB thật (42k): danh sách BK 20 ms (index), search_plan_numbers 48 ms, inspection_stats 34 ms; tìm nhanh BK 160 ms Seq Scan (OR qua 2 bảng) → T-031. Thử tải 1 triệu dòng cần DB thử (người dùng tự tạo) |
| T-031 | Migration 000008: chép tk_number vào inspection_details (trigger) + trigram, view dùng d.tk_number; tìm danh mục bỏ dấu (unaccent) | backend | Xong — đã áp. Lead kiểm: 6 trigger bật, tk lệch 0, stats khớp. Tìm nhanh BK: 160 ms Seq Scan → 7 ms BitmapOr 2 index trigram. `search_lookup_items('driver','nguyen van')` ra "Nguyễn Văn …" 12 ms |
| T-032 | So sánh `mau-nap-du-lieu.xlsx` bản 3 với bản 2 đã nạp | data-analyst + Lead | Diff xong: 41.787 dòng BK chỉ đổi số PXK (bản 2 chứa nhầm số lệnh VC); 12.534 phiếu đổi số lệnh VC (thêm số 0 đầu); +2 dòng BK chỉ có số PXK. Người dùng chốt: số lệnh VC theo file mới; bỏ 2 dòng mới; giữ ngày 63 dòng. XONG: import lại (7 dòng hỏng chữ → sửa từ CSV); UPDATE 41.787 số PXK + 12.534 số lệnh VC; bỏ 2 dòng mới; ngày không đụng. Đối chiếu: lệch 0, stats khớp, 246.043.357,56 kg, 16 dòng số PXK trống |
| T-026 | So sánh `mau-nap-du-lieu.xlsx` bản cập nhật với bản đã nạp | data-analyst + Lead | Diff xong: +2 phiếu tự tạo; 23.600 dòng BK thêm TK; cột số PXK làm lại (~40k dòng); 574 ngày đổi; không dịch dòng; kg không đổi. Người dùng chốt: số PXK theo file mới; giữ ngày đã nạp cho 63 dòng lệch 1 tháng. XONG: import lại (10 dòng hỏng chữ → sửa từ CSV), +2 phiếu tự tạo, UPDATE 41.751 dòng theo import_ref. Đối chiếu: 21.958 phiếu; 41.799 dòng (41.712 có phiếu, 87 không); 246.043.357,56 kg; số PXK lệch 0; ngày > 29/10/2026: 0 |
| T-027 | Ẩn/hiện thẻ số liệu và bộ lọc | frontend | Xong — 178 test qua |
| T-028 | DB chịu tải triệu dòng (D-012): RPC tìm kiếm, bảng tổng hợp `inspection_daily_stats`, index, docs/performance.md | backend | Đang làm |
| T-029 | FE chịu tải: tìm số TK/danh mục lớn phía server, count estimated, lọc theo id thay ilike qua join | frontend | Xong — 183 test qua; tìm server chưa bỏ dấu → thêm unaccent vào T-031 |
| T-022 | Nâng cấp trải nghiệm giao diện + hiển thị dòng không có TK | frontend | Xong — 85 test qua; chưa xem bằng mắt. Thẻ tổng kg chờ T-023 |
| T-023 | Migration 000006: pg_trgm + index tìm kiếm, RPC `inspection_weight_total` (+ thẻ tổng kg FE) | backend + frontend | Code xong, Lead đã review; chờ người dùng chạy 000006 |
| T-005 | Dọn số xe/tài xế không hợp lệ | Lead | Chờ người dùng chạy SQL — `execute_sql` có xóa/sửa bị từ chối 2 lần |
