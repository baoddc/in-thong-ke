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
| T-033 | Thu gọn PageHeader, thẻ số liệu, thanh lọc; chữ gốc 14px, bảng 13px | frontend | Xong — 183 test qua; bảng 16–17 dòng ở 1100×700. Chưa push (git push bị auto-mode chặn — người dùng tự push) |
| T-034 | Quản lý người dùng & phân quyền (D-013): profiles, RLS người tạo + 24h, Edge Function `admin-users` | backend | Code xong, Lead đã review. Edge Function `admin-users` ĐÃ DEPLOY (v1, verify_jwt on). Chờ người dùng chạy 000009, rồi tạo tài khoản Lê Thái Bão → Lead chạy `supabase/import/assign_owner_bao_lt.sql` |
| T-035 | Trang Quản lý người dùng, đăng nhập bằng tên đăng nhập, ẩn nút theo quyền | frontend | Đang làm |
| T-034b | Gán người tạo dữ liệu đã nạp | Lead | Xong: 21.958 phiếu + 41.799 dòng BK → bao.lt; email `.local` dùng được (bao.lt đã đăng nhập) |
| T-036 | Vai trò root (D-014): migration 000010 + Edge Function | backend | Xong — 000010 đã áp (thaibao06061997 = root) |
| T-037 | Vai trò root ở giao diện + thanh phân trang mảnh (giữ đủ thông tin) | frontend | Xong — 217 test qua. Chưa push |
| T-038 | Đếm dòng chính xác (bỏ `estimated` — sai khi có RLS, phân trang hụt trang cuối) | frontend | Xong — 221 test qua; chưa thử với DB thật. Chưa push |
| T-039 | Tự đăng ký chờ duyệt (D-015) + người duyệt/người sửa (D-016): migration 000011, Edge Function `register`, admin-users approve/reject | backend | Xong — 000011 đã áp; `register` v1 (verify_jwt off) + `admin-users` v4 ĐÃ DEPLOY |
| T-040 | Trang Đăng ký + Duyệt/Từ chối + hiện người duyệt/người tạo/người sửa | frontend | Xong — 242 test qua; chưa thử với backend thật. TODO nhỏ: gỡ ép kiểu `get_user_names` trong useUserNames.ts (database.ts đã có). Chưa push |
| T-041 | RPC `list_inspection_details` / `list_transport_plans` (planning nhanh, kèm tên người) — migration 000012 | backend | Xong — đã áp. Lead đo (RLS bao.lt): BK trang đầu 23 ms tổng (trước ~173 ms = 150 planning + 23), BK lọc q+ngày 57 ms (trước ~93), Phiếu 13 ms |
| T-042 | FE dùng RPC mới + cache + prefetch trang kế + debounce 200 ms | frontend | Xong — 247 test qua; chưa push |
| T-043 | Trang Giới thiệu `/gioi-thieu` (10 chức năng nổi bật) | frontend | Xong — 248 test, build qua (Lead chạy lại). Chưa push |
| T-044 | Review commit e38713b (ponytail-review) | Lead | Ship. Đề xuất: (1) prefetch bỏ đếm lại; (2) sanitizeTerm bỏ `_`; (3) makeUsername FE tách từ như server — chưa làm, chờ người dùng chọn |
| T-045 | Giữ chỗ số TK 5 phút (D-018): bảng tk_reservations, reserve/release RPC, create dùng số đã giữ — migration 000013 | backend | Xong (đã chạy 30/10) |
| T-046 | Modal Xem/Sửa không cuộn được (fieldset) + FE dùng giữ chỗ số TK (đếm ngược, trả số khi đóng) | frontend | Xong — chờ người dùng thử trên trình duyệt |
| T-047 | Yêu cầu sửa phiếu quá 24h (D-019): bảng edit_requests, RPC request/decide, RLS update mở khóa 24h — migration 000014 | backend | Xong — chờ người dùng chạy 000014 |
| T-048 | FE yêu cầu sửa (D-019): nút "Yêu cầu sửa", trạng thái chờ/mở khóa, trang duyệt cho admin/root | frontend | Xong (000014 đã chạy) |
| T-049 | Yêu cầu sửa dòng bảng kiểm (detail_id) + Realtime cho edit_requests (D-020) — migration 000015 | backend | Xong (000015 đã chạy) |
| T-050 | FE: Yêu cầu sửa ở Bảng kiểm + thông báo tức thì khi duyệt/từ chối, admin thấy yêu cầu mới ngay (D-020) | frontend | Xong — chờ thử trên trình duyệt |
| T-051 | Thiết kế lại trang Giới thiệu (hero, bắt đầu nhanh, cụm tính năng, bảng quyền, phím tắt) | frontend | Xong |
| T-053 | Giới thiệu: bỏ dải số liệu nạp + thẻ "Dữ liệu chuyển từ Google Sheets" | frontend | Xong |
| T-054 | Bảng kiểm: bỏ bộ lọc Công trình, Đơn vị nhận | frontend | Xong |
| T-055 | Dữ liệu thử tải (LOADTEST-*, tk_year ≥ 2100) ~470k dòng bảng kiểm, DB ~472 MB theo dashboard — cần xóa sau khi thử | Lead | Đang thử |
| T-056 | D-021: list_* security definer + count_* RPC — migration 000016 | backend | Xong (đã chạy; tìm 470k dòng: list 41 ms, đếm 18 ms) |
| T-057 | D-021: FE đếm bằng count_* RPC thay cho count exact | frontend | Xong |
| T-058 | D-021 cho ô Số phiếu TK (In thống kê) + tìm danh mục: search_plan_numbers 5,9 s → security definer — migration 000017 | backend | Xong (đã chạy; search_plan_numbers 29 ms, search_lookup_items 89 ms) |
| T-059 | D-022: Tìm nhanh Nhập phiếu trên mọi cột — migration 000018 (list/count_transport_plans) | backend | Xong (đã chạy) |
| T-062 | D-022: count_* có từ khóa đếm trần 10.001 — migration 000020 | backend | Xong (đã chạy; đếm 'bao' phiếu 188 ms, 'thep' bảng kiểm ~460 ms) |
| T-063 | D-022: FE hiện "hơn 10.000" khi count = 10.001 | frontend | Xong |
| T-060 | D-022: placeholder ô Tìm nhanh Nhập phiếu + Bảng kiểm | frontend | Xong |
| T-061 | D-022: Tìm nhanh Bảng kiểm trên mọi cột — migration 000019 (list/count_inspection_details) | backend | Xong (đã chạy) |
| T-064 | Bản in: chỉ 1 NV xuất kho = NV xuất TP/BTP, không có thì NV xuất VT đầu tiên (pickShipper) | frontend | Xong |
| T-065 | Bản in: ô ký tên cao 28 mm (trước ~17 mm) | frontend | Xong |
| T-066 | Bản in: cột Ngày + Số phiếu xuất kho 1 dòng (7pt, nowrap; rộng 8,5%/9,5%, Tên CT 13,5%) | frontend | Xong |
| T-067 | D-023: thêm dòng nhập trực tiếp trên bảng (Nhập phiếu + Bảng kiểm), Bảng kiểm bắt buộc số TK trước | frontend | Xong — chờ người dùng thử trên trình duyệt |
| T-068 | D-024: Presence — ai đang trực tuyến, đang giữ số TK, đang sửa phiếu/dòng | frontend | Xong — chờ thử 2 tài khoản |
| T-069 | D-025: dòng nháp của người khác hiện trực tiếp trong bảng (kiểu Google Sheets) | frontend | Xong — chờ thử 2 tài khoản (sửa dòng: chỉ nhãn màu, chưa viền cả dòng) |
| T-070 | Presence/nháp hiện họ tên đầy đủ thay username | frontend | Xong |
| T-071 | Hết hạn giữ số: gỡ ngay nháp người khác; tự đóng dòng nhập của mình + toast + release | frontend | Xong |
| T-072 | Nút "Lưu phiếu" / "Lưu dòng" (header + dòng nhập) | frontend | Xong |
| T-073 | Nhập phiếu + Bảng kiểm mặc định lọc ngày xuất = hôm nay (xóa lọc → xem tất cả) | frontend | Xong |
| T-074 | Nút lọc "Hôm nay" trước "Xóa bộ lọc" (Nhập phiếu + Bảng kiểm) | frontend | Xong |
| T-075 | Bảng kiểm: bỏ bộ lọc Loại hình xuất, Mặt hàng | frontend | Xong |
| T-076 | Phiếu mới tự điền NV xuất theo họ tên người đăng nhập (có trong TP/BTP → ô TP/BTP, không thì NV xuất VT); dọn danh mục: NV xuất TP/BTP chỉ Lê Duy Khánh, Lê Giang Khánh; NV xuất VT bỏ 2 người này — Danh mục là nguồn (không cố định tên trong code); sửa phiếu cũ vẫn hiện người ở danh mục kia (`exporterOptions`) | Lead | Xong (dọn bằng T-077) |
| T-077 | Danh mục: xóa được cả mục đang dùng (ẩn, D-026) — migration 000021 + Danh mục/ô chọn bỏ mục đã ẩn | Lead | Xong code · chờ áp migration 000021 |
| T-078 | Tự xóa phiếu/dòng tạo mới còn thiếu thông tin sau 24h + thanh nhắc người tạo (D-027) — migration 000022, IncompleteNotice | Lead | Xong code · chờ áp migration 000022 |
| T-079 | Mọi thao tác realtime (D-028) — migration 000023 + `useDbChange` ở danh sách, số liệu, danh mục, In, người dùng | Lead | Xong code · chờ áp migration 000023, thử 2 máy |
| T-080 | Thiếu thông tin quá 24h: không xóa, khóa thao tác khác tới khi điền đủ (D-029) — migration 000024, useIncomplete | Lead | Xong code · chờ áp migration 000024 |
| T-081 | Nạp bổ sung `mau-nap-du-lieu.xlsx` bản 4 (so với bản 3 đã nạp): +118 phiếu, +148 dòng, 1.110 phiếu đủ NV xuất VT, 'An Hạ' → 'Kho An Hạ' + AH1–AH6; xóa phiếu/dòng thử trên web (người dùng chốt 04/11) — `data/scripts/make_delta.py` → `data/clean/delta_01_chuan-bi.sql`, `delta_02_ap-dung.sql` | Lead | Xong file SQL (pglast parse OK) · chờ người dùng chạy; kỳ vọng sau nạp: 22.076 phiếu, 41.949 dòng, 247.598.111,48 kg | 
| T-086 | Root khôi phục từ nhật ký (D-032) — Lead: migration 000026; frontend: nút Khôi phục + dropdown Người thao tác | Lead + frontend | Xong · 342 test, build OK · người dùng đã chạy 000025/000026 |
| T-088 | Giao diện điện thoại: danh sách dạng thẻ, modal full màn, xem trước In thu nhỏ, nút ≥44px, ô nhập 16px, header sticky — frontend ×2; tester soát ảnh | frontend + tester | Code xong (345 test, build OK). QA ảnh dở: Edge chụp mất phiên đăng nhập; BUG-088-01 (Thấp) link Đăng ký 18px |
| T-089 | Chữ ký "LeThaiBao" chuyển động sau khi đăng nhập như `chuan-bi/mau-ky-ten.mp4`: nét bút đơn chạy trái→phải — `SignatureIntro` + `signatureStrokes.ts` sinh bởi `data/scripts/make_signature.py` (đường tâm font Great Vibes, OFL; không cần mạng) | Lead | **Đã gỡ bỏ** theo yêu cầu người dùng (04/11/2026) |
| T-091 | Sửa lỗi từ security audit run-1 (`C:\Users\benhhc\security-audit-skill\tk\run-1`) — migration 000028: updated_by phục hồi, chặn số TK sai khi insert trực tiếp, nhật ký NV xuất VT mọi đường ghi (constraint trigger hoãn), trần 20 chờ duyệt nguyên tử + giới hạn 5 lần/giờ/IP (register), policy realtime.messages cho presence:kho, tk_next_seq cần user hoạt động | backend | Xong · đã chạy 000028, deploy register, tắt Realtime public access (04/11/2026) |
| T-092 | Presence: kiểm kiểu payload, ErrorBoundary, kênh private | frontend | Xong · 344 test |
| T-093 | Hardening: header bảo mật vercel.json, .gitignore .env.*/__pycache__, Vitest bỏ qua .claude/ | Lead | Xong |
| T-094 | Giữ kín vai trò root ở giao diện chung: trang Giới thiệu chỉ còn Admin / Người dùng, sơ đồ Luồng công việc bỏ "root"; tài liệu hướng dẫn v2 (18 trang, ảnh chú thích số) ở `tai-lieu-noi-bo/` | Lead | Xong · test AboutPage qua |
| T-095 | Sao lưu Excel hằng ngày 16:50 vào `Z:\PHONG KHO\NHOM XUAT HANG\sao-luu-du-lieu-thong-ke`: thư mục `sao-luu/` (Python `sao_luu.py`, `test_sao_luu.py`, `dang-ky-lich.ps1`), lịch Task Scheduler `SaoLuuThongKe`. Mỗi thư mục (gốc / Năm / Tháng / Ngày) có đúng 1 file "Tổng hợp …xlsx" (2 sheet: Nhập phiếu, Bảng kiểm) lọc theo Ngày xuất; đọc 1000 dòng/request; chạy ~4 phút. Cần `sao-luu/.env` (tài khoản đọc) | Lead | Xong · đã chạy thật 1.414 file |
| T-096 | Nạp THÊM `mau-nap-du-lieu.xlsx` bản 5 (07/11/2026), chỉ INSERT, giữ nguyên dữ liệu cũ: +55 phiếu (TK2026/11-076…130), +86 dòng bảng kiểm, 1 đơn vị nhận hàng mới. Sửa `import_nhap_lieu.py` đọc ô Ngày xuất dạng số serial Excel (21.824 ô trước đó bị bỏ trống). Cột Số phiếu xuất kho của dòng CŨ trong file bị đổi gần hết (28.098 dòng = Số lệnh VC) — không nạp. `data/scripts/make_insert_new.py` → `data/clean/them-moi.sql` | Lead | Xong · đã nạp lên Supabase 07/11/2026 (MCP execute_sql): 22.131 phiếu, 42.035 dòng, kg cũ giữ nguyên 247.598.111,48. Còn 3 hàm phụ `_ins_*` chờ người dùng xác nhận xóa |
| T-097 | Bảng: cột Ghi chú rộng hơn + cắt 2 dòng, cột chữ ngắn không gãy dòng (`w`, `clamp`, `nowrap` ở Bảng kiểm/Nhập phiếu); kéo giãn cột (kéo mép tiêu đề, bấm đúp = mặc định, phím ←/→), nhớ ở localStorage — `DataTable` + `useColumnWidths` | Lead | Xong · 348 test |
| T-098 | Nạp nhanh + sao lưu chỉ định: `data/scripts/NAP-DU-LIEU.bat` (bấm đúp: đọc Excel → so với DB → SQL chỉ thêm mới → tự nạp qua Management API khi có `SUPABASE_ACCESS_TOKEN` trong `data/scripts/.env`, có hỏi xác nhận; chưa có thì chép SQL vào clipboard); `sao-luu/SAO-LUU-CHI-DINH.bat` + `sao_luu.py --ngay/--thang/--nam/--toan-bo` (mục 4 = đầy đủ từ trước đến giờ) | Lead | Xong · test qua; phần tự nạp mới thử bằng giả lập, chưa gọi Supabase thật |
| T-099 | Ảnh đại diện lưu ở Supabase Storage: migration 000029 (cột `profiles.avatar_path`, bucket công khai `avatars`, policy, RPC `set_avatar(p_path)`), hộp thoại đổi/gỡ ảnh (cắt vuông 256×256 trên máy), hiện ở thanh bên + trang Quản lý người dùng. CHỈ chủ tài khoản đổi ảnh của mình, admin/root không can thiệp (người dùng chốt 08/11/2026) | Lead | Xong code · 362 test, build OK · **chờ người dùng chạy migration 000029** (MCP bị chặn áp migration lên DB thật) |
| T-100 | Giữ kín tài khoản cấp cao nhất với mọi người dùng (08/11/2026): presence — root ẩn (không track/phát bản nháp, vẫn xem người khác); migration 000030 `get_user_names` không trả tên root cho người khác; Edge Function admin-users: "Duyệt/Tạo bởi" của root để trống với admin + thông điệp lỗi trung tính (không nhắc "root"); test Deno cập nhật | Lead | Xong code · 365 test · **chờ người dùng chạy migration 000030 + deploy admin-users** |
| T-090 | Điện thoại: thẻ Nhập phiếu / Bảng kiểm hiện đầy đủ mọi trường (bỏ `mobile: 'hide'`) | Lead | Xong · 64 test trang qua |
| T-087 | Khôi phục không sinh dòng 'Sửa' phụ (có nút Khôi phục lòng vòng) + dọn dòng phụ cũ — migration 000027 | Lead | Xong (pglast OK) · chờ chạy 000027 |
| T-085 | Nhật ký thao tác admin/root, chỉ root xem (D-031) — Lead: migration 000025 (pglast OK); frontend: trang `/lich-su-thao-tac` + RootOnly | Lead + frontend | Xong code · 339 test, build OK · chờ áp migration 000025 |
| T-084 | Sửa tại chỗ như Google Sheets + cột Thao tác lên đầu (D-030) — frontend ×2 song song (Nhập phiếu / Bảng kiểm) + Lead (DataTable.editRow, chống mất dữ liệu khi chuyển dòng) | frontend + Lead | Xong · 333 test qua · chưa thử trên trình duyệt |
| T-082 | ~4.270 phiếu (từ Google Sheets) ghi người khác 2 Khánh ở NV xuất TP/BTP → chuyển lên đầu NV xuất VT, TP/BTP trống (người dùng chốt 04/11) — `supabase/import/move_fg_to_vt.sql` | Lead | Xong file SQL (pglast OK) · chờ người dùng chạy. Lưu ý: lần nạp sau (`make_delta.py`) chưa tự chuyển — chạy lại file này sau mỗi lần nạp |
| T-052 | Vẽ lại sơ đồ Luồng công việc bằng Archify → public/luong-cong-viec.html (nguồn: .archify/workflow-luong-cong-viec-20261030-142358/candidate.json) | Lead | Xong |
| T-005 | Dọn số xe/tài xế không hợp lệ | Lead | Chờ người dùng chạy SQL — `execute_sql` có xóa/sửa bị từ chối 2 lần |
