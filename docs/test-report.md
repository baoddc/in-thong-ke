# Test Report — 29/10/2026 — Task T-025 (kiểm thử tổng thể)

Phạm vi: đọc code + chạy lệnh cục bộ. **Không** truy cập DB thật (21.956 phiếu, 41.799 dòng bảng kiểm, 246.043.357,56 kg), không chạy trình duyệt có đăng nhập, không có Playwright/pgTAP.

## Tổng quan

### Kết quả lệnh
| Lệnh | Kết quả |
|---|---|
| `npm run lint` | Qua (0 lỗi, 0 cảnh báo) |
| `npm run typecheck` | Qua |
| `npm run test` | Qua — 20 file, **173 đạt**, 3 "expected fail" (`it.fails`, lỗi đã biết mức Thấp), 0 lỗi. Trước T-025: 16 file / 105 test |
| `npm run build` | Qua — `tsc --noEmit && vite build`, 100 module, JS 471 kB (gzip 136 kB), CSS 29 kB |
| `npx playwright test` | Không chạy — dự án chưa cài/cấu hình Playwright (không có trong `package.json`) |
| `supabase db reset` + SQL/pgTAP | Không chạy — không có CLI/DB cục bộ, không có thư mục test SQL |

### Theo lớp
| Lớp | Đạt | Lỗi | Bỏ qua / chưa làm được |
|---|---|---|---|
| Unit FE (Vitest + Testing Library) | 173 | 0 | 3 expected-fail ghi lỗi Thấp (BUG-005/006/007) |
| Dữ liệu (kiểm nhanh CSV bằng script tạm) | 6 kiểm tra | 0 | Lệch tài liệu ↔ CSV (BUG-003) |
| Database (RLS/ràng buộc/RPC thật) | — | — | Chưa kiểm được; chỉ đọc migration (mục "Đối chiếu") |
| E2E Playwright, khổ 375px | — | — | Chưa có |

### Test đã thêm (T-025, không sửa code sản phẩm)
Dự án đặt test cạnh file nên các file mới cũng ở cạnh file:
- `src/components/PlanFormModal.test.tsx` — tạo phiếu gọi `create_transport_plan` đúng 8 tham số; NV xuất VT giữ thứ tự chọn (`[12, 11]`); trim ô text, ô trắng → `null`; ngày nhuận 29/02/2028; 31/02 và ô ngày trống không gọi RPC; bấm Lưu 2 lần (RPC chậm) → 1 lời gọi; chữ gõ dở ở ô chọn chặn lưu; lỗi `P0001` hết số hiện tiếng Việt và nút Lưu bấm lại được; sửa phiếu gọi `update_transport_plan` với `p_id`, thứ tự theo `sort_order`.
- `src/components/InspectionFormModal.qa.test.tsx` — số VN chặt: `5.5`, `1.23`, `-3`, `abc`, `1,2,3` bị từ chối và không ghi DB, báo đúng ô; `1.234,5` → 1234.5; `0` giữ là 0, ô trống → `null`; bấm Lưu / "Lưu và thêm dòng tiếp" 2 lần → 1 dòng; sửa dòng đã có TK rồi xóa TK → bị chặn.
- `src/components/PrintSheet.test.tsx` — phiếu không dòng (tổng 0,00; số phiếu 0), tổng khối lượng lớn (246.043.358,00), "Tổng số phiếu" đếm trùng, ô trống không in `null`, chuỗi tiếng Việt rất dài/ký tự `<b>&"` không bị chèn HTML, tên in HOA có dấu.
- `src/lib/qa.test.ts` — ngày biên (29/02 năm nhuận và không nhuận, 31/04, 31/12 → 01/01, `todayISO` theo giờ Việt Nam lúc 17:30 UTC cuối năm, `monthRange` qua năm); `parseVnNumber` nhiều dạng sai; round-trip số 3 chữ số thập phân; cộng dấu phẩy động (0,1 × 1000 = 100,00); phân trang (trang cuối 836 = range 41750..41799, `page=0/-1/abc`, size ngoài danh sách, ngày lọc sai).

## Lỗi

Tóm tắt: **Cao 0 · Trung bình 3 · Thấp 8**. Không có lỗi mức Cao đang mở.

### BUG-001 [Trung bình] Tải toàn bộ số phiếu TK về trình duyệt qua 22 request tuần tự
- Agent cần sửa: frontend (có thể kèm backend nếu thêm RPC tìm số phiếu)
- Vị trí: `src/lib/usePlanNumbers.ts:15-21`, dùng ở `src/pages/PrintPage.tsx:19-20` và `src/components/InspectionFormModal.tsx:44`; tương tự `src/lib/useLookups.ts:32` (~4.300+ mục, 5 request tuần tự, gọi ở cả 3 trang)
- Cách tái hiện: 1. Đăng nhập với DB thật (21.956 phiếu). 2. Mở `/in-thong-ke?tk=...` hoặc bấm "Thêm dòng" ở Bảng kiểm. 3. Đo thời gian đến khi ô "Số phiếu TK" dùng được.
- Kết quả mong đợi: dưới ~2 giây (CLAUDE.md mục 1.2); tìm số phiếu phía server (`ilike` + `limit 20`), không tải hết về.
- Kết quả thực tế (suy từ code, chưa đo): 22 request × 1000 dòng nối tiếp mỗi lần mở; trang In không biết `planId` (và không tải bản in) cho tới khi tải xong cả danh sách. Mở lại modal là tải lại toàn bộ.
- Test liên quan: không test được thời gian trong Vitest; cần đo tay hoặc E2E.
- Trạng thái: Mở

### BUG-002 [Trung bình] Bản in "Ngày lập" lấy `created_at` — phiếu cũ đã nạp sẽ in ngày nạp (29/10/2026)
- Agent cần sửa: frontend (cần Lead quyết định dùng trường nào: `export_date`, hay cột ngày lập riêng)
- Vị trí: `src/components/PrintSheet.tsx:29` (`formatDateTime(plan.created_at)`)
- Cách tái hiện: 1. Mở In thống kê cho một phiếu cũ nạp từ file (vd `TK2024/05-345`). 2. Xem dòng "Ngày lập".
- Kết quả mong đợi: ngày lập thực của phiếu (mẫu `mau-phieu-in.pdf`).
- Kết quả thực tế: mọi phiếu nạp 29/10/2026 đều có `created_at` = thời điểm nạp → in ngày sai trên giấy tờ.
- Test liên quan: `src/pages/PrintPage.test.tsx` (chỉ kiểm phiếu mới tạo); không thêm test vì chờ quyết định.
- Trạng thái: Mở

### BUG-003 [Trung bình] CSV nạp hiện tại và tài liệu lệch với dữ liệu đã nạp vào DB
- Agent cần sửa: data-analyst (và Lead cập nhật plan/decisions)
- Vị trí: `data/clean/import_plans.csv`, `import_details.csv` (sửa 18:26), `data/clean/v1_*`, `_diff_*.csv`, `data/scripts/diff_import.py` ↔ `docs/data-spec.md:106,110,125` ↔ `docs/plan.md` T-020/T-021
- Cách tái hiện: đếm bằng script đọc CSV: `import_plans.csv` = **21.958** dòng (5.460 phiếu tự tạo), `import_details.csv` = 41.799 dòng trong đó **41.712 có `tk_number`**, 87 không, 0 dòng ngày > 29/10/2026. `data-spec.md` và DB đã nạp ghi: 21.956 phiếu (5.458 tự tạo), **18.112 có phiếu / 23.687 không**, 194 dòng ngày sau 29/10/2026.
- Kết quả mong đợi: tài liệu, CSV và DB cùng một phiên bản; nếu CSV mới (v2) là bản định nạp lại thì ghi vào data-spec/decisions (quy tắc mới gán số TK cho ~23.600 dòng đang không có TK, thêm 2 phiếu `TK2025/08-074`, `TK2026/04-306`).
- Kết quả thực tế: chưa có Changelog/quyết định nào cho v2. Chạy lại `apply_legacy_import.sql` với CSV hiện tại sẽ nạp khác với bản đã duyệt. Các kiểm tra khác trên CSV đều đạt: tổng kg = 246.043.357,56; không trùng `import_ref`/`tk_number`; không dòng bảng kiểm treo TK; không số âm; không khoảng trắng đầu/cuối; không lỗi font (số lần khớp "Ã" là chữ hợp lệ như "QUẢNG NGÃI", "ĐÃ").
- Test liên quan: script tạm trong thư mục scratchpad, chưa đưa vào `tests/`.
- Trạng thái: Mở

### BUG-004 [Thấp] Xóa phiếu đang có dòng bảng kiểm báo sai nội dung
- Agent cần sửa: frontend
- Vị trí: `src/lib/format.ts:36` (`23503` → "Mục đang được dùng trong phiếu, không xóa được."), gọi từ `src/pages/PlansPage.tsx:70`; cũng hiện khi lưu phiếu với id danh mục vừa bị xóa
- Cách tái hiện: 1. Xóa một phiếu đã có dòng bảng kiểm (FK `inspection_details_plan_id_fkey` là restrict). 2. Xem toast.
- Kết quả mong đợi: "Phiếu đang có dòng trong Bảng kiểm, hãy xóa/chuyển các dòng đó trước."
- Kết quả thực tế: "Mục đang được dùng trong phiếu…" (nói về danh mục, gây hiểu nhầm).
- Test liên quan: `src/lib/format.test.ts` (chỉ kiểm chuỗi hiện tại)
- Trạng thái: Mở

### BUG-005 [Thấp] `parseVnNumber('0.500')` ra 500
- Agent cần sửa: frontend
- Vị trí: `src/lib/format.ts:27`
- Cách tái hiện: gõ `0.500` ở Tổng khối lượng (ý định 0,5 kg) rồi lưu.
- Kết quả mong đợi: bị từ chối (nhóm đầu bắt đầu bằng 0 không phải hàng nghìn hợp lệ).
- Kết quả thực tế: lưu 500 kg, không cảnh báo.
- Test liên quan: `src/lib/qa.test.ts` (`it.fails`) — khi sửa, đổi `it.fails` thành `it`.
- Trạng thái: Mở

### BUG-006 [Thấp] Không chặn số vượt `numeric(18,3)`
- Agent cần sửa: frontend
- Vị trí: `src/lib/format.ts:24-30`, `src/components/InspectionFormModal.tsx:99-102`
- Cách tái hiện: gõ `1.000.000.000.000.000.000` (≥ 10^15) ở Số lượng/Khối lượng rồi lưu.
- Kết quả mong đợi: báo "quá lớn" bằng tiếng Việt.
- Kết quả thực tế: gửi lên DB, `errorMessage` hiện "Có lỗi xảy ra: numeric field overflow" (tiếng Anh). Ngoài ra nhập quá 3 chữ số thập phân (vd `1,2345`) bị DB làm tròn im lặng.
- Test liên quan: `src/lib/qa.test.ts` (`it.fails`)
- Trạng thái: Mở

### BUG-007 [Thấp] `?page=` quá lớn tạo offset không phải số nguyên an toàn
- Agent cần sửa: frontend
- Vị trí: `src/lib/listQuery.ts:25-28,99`
- Cách tái hiện: mở `/bang-kiem?page=99999999999999999999` → PostgREST nhận offset `5e+21` và trả lỗi 400; trang hiện lỗi chung (bấm sắp xếp mới thoát).
- Kết quả mong đợi: chặn trần theo `pageCount` hoặc số nguyên an toàn.
- Test liên quan: `src/lib/qa.test.ts` (`it.fails`)
- Trạng thái: Mở

### BUG-008 [Thấp] Sửa phiếu không có ngày xuất tự điền ngày hôm nay
- Agent cần sửa: frontend
- Vị trí: `src/components/PlanFormModal.tsx:19` (`p?.export_date ?? todayISO()`)
- Cách tái hiện: sửa một phiếu cũ/phiếu tự tạo có `export_date` null rồi bấm Cập nhật mà không để ý ô ngày.
- Kết quả mong đợi: ô ngày để trống (hoặc báo rõ) khi phiếu gốc không có ngày.
- Kết quả thực tế: ngày hôm nay được lưu như ngày xuất.
- Test liên quan: chưa có (cần dữ liệu phiếu null ngày trong DB để xác nhận có xảy ra thật).
- Trạng thái: Mở

### BUG-009 [Thấp] `docs/api-contract.md` lệch migration/code
- Agent cần sửa: backend
- Vị trí: `docs/api-contract.md:3`, `:8`, `:9`, `:16`
- Chi tiết:
  1. Dòng 3 chưa liệt kê migration `20261029000006_perf_stats.sql` (chỉ nằm ở Changelog).
  2. Dòng 8: "Unique `(kind, lower(name))`" — thực tế (000004) không áp cho `kind = 'construction'`; chỉ Changelog nhắc.
  3. Dòng 9: danh sách cột `inspection_details` thiếu `shipper_id` (có trong migration 000004 và `src/types/database.ts`).
  4. Dòng 16: không liệt kê tên FK của bảng nối `tpme_plan_id_fkey`, `tpme_lookup_id_fkey` (có trong `database.ts`) và `inspection_details_shipper_id_fkey`.
- Trạng thái: Mở

### BUG-010 [Thấp] Hiệu năng tìm kiếm Bảng kiểm: `or(...)` trộn cột của nhiều bảng
- Agent cần sửa: backend (hoặc bỏ bớt cột tìm)
- Vị trí: `src/pages/InspectionPage.tsx:24` (`searchCols`: `tk_number`, `warehouse_slip_no`, `construction_code`, `construction_name`) trên `inspection_details_view`; index trigram ở `20261029000006_perf_stats.sql`
- Chi tiết: điều kiện `OR` trên cột thuộc 3 bảng khác nhau (qua join) thường không dùng được index trigram → quét ~41.799 dòng + join mỗi lần gõ (kèm `count: 'exact'`). Sắp xếp theo `tk_number`/`construction_*` cũng sắp trên cột join. Chưa đo được trên DB thật; 42k dòng có thể vẫn dưới 2 giây.
- Trạng thái: Mở (cần đo)

### BUG-011 [Thấp] Trang Danh mục vẽ toàn bộ mục của một loại, không phân trang
- Agent cần sửa: frontend
- Vị trí: `src/pages/LookupsPage.tsx:67,101-120`
- Chi tiết: Số xe ~1.414, Công trình ~930, Đơn vị nhận hàng ~1.400 mục mỗi tab, mỗi dòng có nút → vài nghìn phần tử DOM; chậm trên máy yếu/375px.
- Trạng thái: Mở

### Lưu ý (không phải lỗi đã xác nhận)
- `.playwright-mcp/` (log phiên chạy thử, không chứa token — đã grep) chưa nằm trong `.gitignore`; thư mục gốc hiện không phải git repo nên không kiểm được việc commit. Nên thêm `.playwright-mcp` vào `.gitignore`.
- Log cũ `.playwright-mcp/console-2026-10-29T07-16-21-022Z.log` có 72 cảnh báo React "two children with the same key `0-true`" từ `PlansPage` (phiên bản trước khi tách `PlanFormModal`). Code hiện tại không còn dạng key đó nhưng chưa xác nhận trên trình duyệt: Lead mở lại Thêm/Sửa phiếu và xem console.
- Log cũ báo `favicon.ico` 404 nhưng `index.html` đã trỏ `/logo-daidung.png` — coi như đã sửa, cần xem lại.

## Đối chiếu hợp đồng ↔ code

| Hạng mục | Kết quả |
|---|---|
| Tên bảng/view trong `src/` (`lookup_items`, `transport_plans`, `transport_plan_material_exporters`, `inspection_details`, `inspection_details_view`) | Khớp `database.ts` và migration |
| Tên FK embed trong `PLAN_SELECT` (`transport_plans_{transport_type,vehicle,driver,fg_exporter}_id_fkey`) | Khớp migration 000001 và `database.ts`; `lookup:lookup_items(id,name)` từ bảng nối không mơ hồ (chỉ 1 FK tới `lookup_items`) |
| `inspection_details.plan_id` nullable | `database.ts` `number | null` (Row), Insert tùy chọn; `InspectionRow.plan_id: number | null`; FE kiểm `tkRequired` (thêm mới bắt buộc, dòng cũ không TK được để trống) — khớp 000005 |
| `inspection_details_view` | 32 cột trong 000005 = 32 cột contract = 32 cột `database.ts`; có `shipper_id`, `plan_shipper_name`; `left join transport_plans` → các cột từ phiếu nullable đúng; `security_invoker = true` |
| RPC `create_transport_plan`/`update_transport_plan` | 8 / 9 tham số `bigint`/`bigint[]`, FE truyền đủ (test đã thêm), thứ tự mảng → `sort_order` (000003) |
| RPC `next_tk_number`, `inspection_weight_total(p_from,p_to)` | Khớp chữ ký và kiểu trả về (`string`, `number`); FE dùng `Number(w.data ?? 0)`; lỗi RPC → thẻ "—" (có test) |
| `tk_format`, `tk_next_seq` | Có trong `database.ts`, FE không gọi (đúng như contract) |
| `tk_seq` 1..9999, `import_ref` unique, `lookup_items.code`, 12 `kind` | Khớp migration 000003/000005 |
| Bảng tạm `import_plans`/`import_details` | Không có trong `database.ts` — đúng ý (anon/authenticated không có quyền) |
| Lệch | Xem BUG-009 |

### Migrations 000001–000006
- **RLS**: bật cho cả 6 bảng (`lookup_items`, `transport_plans`, `transport_plan_material_exporters`, `inspection_details`, `import_plans`, `import_details`); 4 policy `to authenticated using ((select auth.uid()) is not null)` cho 4 bảng nghiệp vụ; bảng tạm RLS bật, **không policy**, `revoke all from anon, authenticated`, có `assert` kiểm trong 000005. View `security_invoker = true`, `revoke all from anon`.
- **Grant**: mọi hàm nghiệp vụ `revoke ... from public, anon`, `grant ... to authenticated`; `set_updated_at`, `lock_tk_fields` không cấp; `inspection_weight_total` đã `revoke` và `grant` đúng (có assert).
- **Ràng buộc**: `name`/`code` check đã trim; `quantity`/`total_weight_kg` `>= 0`; FK `restrict`; trigger khóa số TK. Khớp mô tả contract.
- **Đã để ý**: `D-003` (v1: mọi người đã đăng nhập toàn quyền) là chủ ý — nghĩa là không có test "người dùng khác bị chặn" nào có ý nghĩa ở v1; chỉ cần `anon` bị chặn (xem "Chưa kiểm được").

## Definition of Done (CLAUDE.md mục 8)

| Mục | Kết quả |
|---|---|
| `lint`, `typecheck`, `test` qua | Đạt (kèm `build`) |
| Migration chạy sạch từ đầu (`supabase db reset`) | **Chưa kiểm được** (không có CLI/DB cục bộ). Đọc code: 000001→000006 theo thứ tự hợp lý, 000003–000006 viết lại chạy được nhiều lần |
| Không còn lỗi Cao đang mở | Đạt (0 lỗi Cao) |
| Hợp đồng khớp code | Gần đạt — lệch tài liệu BUG-009; BUG-003 lệch dữ liệu ↔ tài liệu |
| Tiếng Việt có dấu đúng, chạy được 375px | Chữ: đạt (grep chuỗi không dấu trong `src/` không thấy; `<html lang="vi">`). 375px: đọc code đạt — `main` có `min-w-0`, bảng nằm trong khung `overflow-auto`, modal `max-sm:w-screen`, ngăn kéo menu, ô lọc `col-span-2 sm:w-*`; chỗ duy nhất rộng cố định là bản in `w-[194mm]` nằm trong khung `overflow-x-auto` (chủ ý). **Chưa xem trên trình duyệt thật** |
| Ngày `dd/MM/yyyy`, số kiểu VN | Đạt (`formatDate`, `DateInput`, `formatNumber`, `formatFixed2`, có test) |
| Không hard-code secret | Đạt: `src/` không có key/token; `.env.local` chỉ có URL + publishable key, và được `.gitignore` (`.env.local`, `*.local`) loại; `.env.example` để trống |
| RLS mọi bảng | Đạt theo migration (kể cả `import_*`) |
| `plan.md` cập nhật | Lead làm |

**Kết luận T-025: đạt mức mã nguồn** (lệnh chất lượng qua, 0 lỗi Cao). Chưa thể gọi là đạt DoD đầy đủ vì còn các mục "Chưa kiểm được" bên dưới; nên xử lý BUG-001 và BUG-002 trước khi giao người dùng dùng thật.

## Chưa kiểm được
1. Chạy thật trên trình duyệt có đăng nhập: tải trang dưới 2 giây với 21.956 phiếu/41.799 dòng (BUG-001, BUG-010), thao tác thêm/sửa/xóa trên DB thật, ảnh chụp 375px.
2. In thật: xem trước in/Ctrl+P trên A4 dọc (ngắt trang, lặp tiêu đề bảng, ảnh header), so với `mau-phieu-in.pdf`.
3. E2E Playwright: chưa cài. Đề xuất luồng: đăng nhập → Danh mục thêm mục → Nhập phiếu (kiểm số TK cấp) → Bảng kiểm thêm dòng → lọc → In → sửa → xóa; chạy ở 1280px và 375px.
4. Database thật: `supabase db reset`; test SQL/pgTAP cho RLS (`anon` không đọc/ghi 4 bảng, view, 5 RPC; `authenticated` đọc/ghi được), RPC `create_transport_plan` chạy đồng thời 2 phiên không trùng số, lấp số khuyết, `P0001` khi hết số, `lock_tk_fields` chặn đổi số TK, unique `lookup_items` (kể cả ngoại lệ `construction`), check âm/trống. Chưa có thư mục test SQL nào trong dự án.
5. Đối chiếu số liệu DB thật: 21.956 phiếu, 41.799 dòng, 246.043.357,56 kg (đã khớp ở CSV; DB do Lead đã báo khớp, tester không truy cập).
6. Xuất file PDF/Excel: tính năng chưa làm (CLAUDE.md mục 1.3), plan ghi "Xuất Excel chưa làm".
7. Mất mạng giữa chừng khi lưu: chỉ kiểm được gián tiếp (lỗi RPC hiện thông báo và nút Lưu bấm lại được); chưa mô phỏng offline thật.
