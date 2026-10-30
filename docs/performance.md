# Hiệu năng và chịu tải (T-028, D-012)

## Mục tiêu
- `inspection_details` 1–5 triệu dòng, `transport_plans` >= 500.000, `lookup_items` vài chục nghìn (công trình, đơn vị nhận, xe, tài xế).
- Mọi màn hình thường dùng < 2 s đầu-cuối; truy vấn DB cho một trang 50 dòng < 100 ms (số cụ thể ở `supabase/tests/perf/seed_synthetic.sql`, Phần C).
- Không tải toàn bộ bảng/danh mục lớn về trình duyệt; không cộng tổng ở trình duyệt.

## Truy vấn chính của FE và index phục vụ
| Truy vấn | Index / cơ chế |
|---|---|
| Danh sách phiếu, mới nhất trước, phân trang | `transport_plans_created_at_id_idx (created_at desc, id desc)` |
| Phiếu lọc khoảng ngày xuất | `transport_plans_export_date_id_idx (export_date desc, id desc)` |
| Tìm số TK / số lệnh VC (`ilike '%x%'`) | GIN trigram `transport_plans_tk_number_trgm_idx`, `..._transport_order_no_trgm_idx` |
| Combobox số TK | RPC `search_plan_numbers` (trigram, tối đa 50 dòng) |
| Combobox danh mục lớn | RPC `search_lookup_items`: rỗng -> `lookup_items_kind_name_id_idx (kind, name, id)`; có chữ -> GIN trigram `lookup_items_name_trgm_idx`, `lookup_items_code_trgm_idx` |
| Hiển thị tên các id đang chọn | RPC `get_lookup_items(ids)` (khóa chính) |
| Danh sách bảng kiểm, mới nhất trước | `inspection_details_created_at_id_idx (created_at desc, id desc)` |
| Bảng kiểm lọc khoảng ngày | `inspection_details_export_date_id_idx (export_date desc, id desc)` |
| Bảng kiểm lọc công trình / đơn vị nhận / loại hình / mặt hàng / ĐVT / nhà xe / NV xuất / phiếu (theo **id**) | index từng cột khóa ngoại (`inspection_details_<cột>_idx`) |
| Bảng kiểm tìm số phiếu xuất kho | GIN trigram `inspection_details_warehouse_slip_no_trgm_idx` |
| Bảng kiểm tìm nhanh số TK **hoặc** số phiếu xuất kho (`.or(tk_number.ilike, warehouse_slip_no.ilike)` trên `inspection_details_view`) | GIN trigram `inspection_details_tk_number_trgm_idx` + `..._warehouse_slip_no_trgm_idx` -> BitmapOr (000008; `tk_number` là bản sao trên `inspection_details`) |
| Combobox danh mục lớn, không phân biệt dấu ("dang" ra "Đặng") | `search_lookup_items` so khớp `f_search_norm(name/code)`; GIN trigram `lookup_items_name_norm_trgm_idx`, `lookup_items_code_norm_trgm_idx` (000008) |
| Thẻ/báo cáo tổng khối lượng, thống kê theo loại hình / mặt hàng / tháng | bảng `inspection_daily_stats` (unique `(export_date, export_type_id, product_id)`) qua `inspection_weight_total`, `inspection_stats` |

## Quy tắc cho FE
1. **Đếm:** `select('*', { count: 'estimated' })`, không `exact` trên bảng lớn. Hiển thị "khoảng N" khi N lớn.
2. **Tìm phía server:** số TK, công trình, đơn vị nhận, xe, tài xế dùng `search_plan_numbers` / `search_lookup_items` (debounce ~250 ms, từ khóa >= 3 ký tự mới tìm trong nội dung; ngắn hơn chỉ khớp đầu chuỗi hoặc hiện 20 mục đầu). Danh mục nhỏ (< 500 mục) vẫn tải hết.
3. **Lọc bảng kiểm theo id**, không `ilike` trên cột của bảng nối (`construction_name`, `receiving_unit_name`... trong view không có index). `ilike` chỉ trên `warehouse_slip_no` (và `tk_number` của phiếu).
4. **Sắp xếp luôn kèm `id`:** `.order('created_at', {ascending:false}).order('id', {ascending:false})` hoặc `export_date` + `id`; mọi kiểu sắp khác phải có index tương ứng mới được thêm.
5. **Phân trang:** offset cho vài trang đầu (giới hạn trang tối đa ~200, khoảng 10.000 dòng); xa hơn bắt người dùng thu hẹp bộ lọc. Tránh `select *` trên view khi chỉ cần vài cột.
6. **Thống kê/tổng:** luôn gọi RPC (`inspection_stats`, `inspection_weight_total`), không tải dòng về cộng. Trang in lớn: lọc rồi tải theo lô (`range`), không tải cả bảng.
7. **Ghi hàng loạt** (nạp CSV): chèn nhiều dòng trong một câu `insert` (trigger tổng hợp chạy một lần mỗi câu, không mỗi dòng).

## Bảng tổng hợp `inspection_daily_stats`
- Một dòng cho mỗi `(export_date, export_type_id, product_id)` có dữ liệu (null gom vào nhóm null riêng); số dòng <= số dòng bảng kiểm, thực tế ít hơn nhiều.
- Trigger statement-level (transition tables) trên INSERT/UPDATE/DELETE cộng/trừ delta; TRUNCATE xóa bảng tổng hợp.
- Dòng có `row_count = 0` có thể còn lại sau khi xóa hết dòng của một nhóm: vô hại.
- Lệch (do ai đó tắt trigger, nạp bằng `session_replication_role = replica`, v.v.): chạy `select public.rebuild_inspection_daily_stats();` (chỉ postgres/Dashboard). Hàm khóa ghi bảng kiểm trong lúc tính (vài giây với 1 triệu dòng).
- Chi phí ghi: mỗi câu ghi thêm 1 upsert nhỏ vào bảng tổng hợp; nạp song song nhiều lô có thể tranh chấp khóa cùng dòng nhóm (đã sắp khóa theo cùng thứ tự để tránh deadlock).

## Index thừa (chỉ liệt kê, KHÔNG drop; xét xóa sau khi đo thực tế)
| Index | Bị thay bởi | Lý do giữ |
|---|---|---|
| `transport_plans_created_at_idx (created_at desc)` | `transport_plans_created_at_id_idx` | Trùng tiền tố; xóa tiết kiệm ghi + dung lượng |
| `transport_plans_export_date_idx (export_date)` | `transport_plans_export_date_id_idx` | Btree quét ngược được, nên trùng |
| `inspection_details_created_at_idx (created_at desc)` | `inspection_details_created_at_id_idx` | Trùng tiền tố |
| `inspection_details_export_date_idx (export_date)` | `inspection_details_export_date_id_idx` | Trùng |
Mỗi index thừa trên bảng 1–5 triệu dòng tốn vài chục–trăm MB và làm chậm ghi một chút. Đề xuất: sau khi đo (Phần C) không còn kế hoạch nào dùng chúng thì tạo migration riêng `drop index` (cần người dùng đồng ý).

## Ngưỡng xem xét phân vùng (partition)
- Chưa phân vùng. Xem xét `inspection_details` theo năm (`export_date` hoặc `created_at`) khi: > 20 triệu dòng, hoặc `vacuum`/tạo index > vài phút, hoặc cần chuyển dữ liệu cũ sang lưu trữ.
- Đổi sang phân vùng cần khóa chính chứa cột phân vùng và thiết kế lại FK; làm trước khi quá lớn.

## Kết quả đo thật (Lead, DB thật: 21.958 phiếu, 41.800 dòng bảng kiểm, `explain analyze`)
| Truy vấn | Trước 000008 | Ghi chú |
|---|---|---|
| Danh sách bảng kiểm 50 dòng | 20 ms | dùng index |
| `search_plan_numbers` | 48 ms | trigram |
| `inspection_stats` | 34 ms | bảng tổng hợp |
| Tìm nhanh bảng kiểm trên view: `.or(tk_number.ilike.%x%, warehouse_slip_no.ilike.%x%)` | **160 ms**, Seq Scan `inspection_details` + `transport_plans` | `tk_number` lấy từ `transport_plans` (left join) nên OR trải 2 bảng; ở 1-5 triệu dòng sẽ vài giây |
| Planning time của view | ~100 ms | 13 join; ghi nhận, chưa xử lý |

Sửa ở 000008: sao chép `tk_number` vào `inspection_details` (trigger điền, bất biến nhờ `lock_tk_fields`), view dùng `d.tk_number`, thêm GIN trigram -> BitmapOr trên một bảng. Cần đo lại sau khi áp (câu mẫu ở cuối file migration; kỳ vọng Bitmap Index Scan trên 2 index trigram của `inspection_details`, không Seq Scan). Chi phí ghi: thêm 1 index GIN và 1 tra cứu khóa chính mỗi lần insert/đổi `plan_id`. Backfill trong migration tạm tắt trigger `updated_at` và trigger thống kê để không đổi `updated_at` và không chạy upsert thống kê thừa.

## Danh sách qua RPC (T-041, D-017)
- Số đo trước (DB thật, RLS như người dùng, 50 dòng): `inspection_details_view` **planning 82–150 ms**, execution 11–23 ms; đếm trên bảng gốc 14 ms. View ghép 15 bảng nên planner tốn thời gian mỗi request (pooler không giữ prepared plan).
- Cách sửa (000012): `list_inspection_details(...)` / `list_transport_plans(...)` lấy id của trang từ bảng gốc (index created_at/export_date, trigram cho `q`), rồi mới join danh mục cho <= 200 dòng theo thứ tự cố định (`join_collapse_limit = 1`); `plan_cache_mode = force_custom_plan` để tham số null được rút gọn (tránh kế hoạch chung làm mất index trigram).
- Ngưỡng mong đợi ở ~42.000 dòng: **planning < 10 ms, execution < 30 ms** cho trang mặc định, tìm nhanh và sắp theo `export_date`. Sắp theo cột còn lại (`tk_number`, `warehouse_slip_no`, tên danh mục, số lượng, khối lượng) không có index nên có thể chậm hơn (top-N trên tập đã lọc).
- Số đo sau: (chưa đo - Lead đo sau khi áp 000012; câu mẫu ở cuối file migration).

## Vận hành khi dữ liệu lớn
- Tạo index trên bảng đang chạy: dùng `create index concurrently` (ngoài giao dịch) khi bảng > vài trăm nghìn dòng; migration 000007 tạo thường vì 42.000 dòng chỉ khóa ghi chưa tới vài giây.
- Sau nạp lớn: `analyze` các bảng (nhất là trước khi đo `explain`).
- `count: 'estimated'` chính xác nhờ autovacuum/analyze; sai lệch lớn -> chạy `analyze`.

## Cách kiểm tải
1. Tạo **branch/DB thử** đã áp 000001–000007 (không dùng DB thật).
2. Chạy `supabase/tests/perf/seed_synthetic.sql`: Phần A (hàm), rồi `select perf_synth.add_plans(100000);` x5 và `select perf_synth.add_details(100000);` x10 (mỗi lô một lần Run), Phần B (analyze).
3. Chạy từng câu `explain (analyze, buffers)` ở Phần C (C1–C16); mỗi câu có ngưỡng ghi cạnh. Chạy hai lần, lấy lần hai.
4. Tăng N (thêm lô `add_details`) lên 3–5 triệu và chạy lại; ngưỡng cho phép tăng tối đa 2x so với 1 triệu.
5. Ghi kết quả (Execution Time, kích thước bảng/index từ C16) vào `docs/test-report.md` (tester) hoặc bảng dưới đây.

| Ngày | N dòng bảng kiểm / phiếu | Câu | Thời gian | Đạt? |
|---|---|---|---|---|
| (chưa đo) | | | | |

## Ngưỡng chấp nhận (tóm tắt)
| Nhóm | Ngưỡng (1 triệu dòng, cache nóng) |
|---|---|
| Trang đầu phiếu / bảng kiểm (C1, C4) | < 20 ms / < 50 ms, không Sort, không Seq Scan |
| Lọc theo ngày / id (C3, C6–C9) | < 100 ms |
| Trang sâu offset 10.000 (C2, C5) | < 150 ms / < 300 ms |
| Tìm ilike >= 3 ký tự (C10–C12) | < 100 ms (RPC < 30 ms) |
| Thống kê từ bảng tổng hợp (C13) | < 50 ms |
| Ước lượng số dòng (C14) | < 5 ms, sai lệch < 10% |
| Ghi 1 dòng / 1000 dòng kèm trigger (C15) | < 10 ms / < 300 ms |
