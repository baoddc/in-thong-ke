# Data Spec

> Phạm vi hiện tại: nạp dữ liệu cũ từ `chuan-bi/mau-nap-du-lieu.xlsx` (T-020, quyết định D-011). Phần chuyển dữ liệu từ Google Sheets Kho An Hạ (D-001) chưa làm ở tài liệu này.

## Nguồn
| File/Link | Sheet | Số dòng gốc | Số dòng sạch | Số dòng loại |
|---|---|---|---|---|
| `chuan-bi/mau-nap-du-lieu.xlsx` | `Nhap phieu` (tiêu đề dòng 1, dòng 2 là gợi ý, dữ liệu từ dòng 3) | 16.511 (bỏ thêm 17 dòng trống) | 16.498 phiếu thật + 5.458 phiếu tự tạo = 21.956 dòng `import_plans.csv` | 13 (6 thiếu số TK, 4 trùng số TK, 3 số TK dạng lạ) |
| `chuan-bi/mau-nap-du-lieu.xlsx` | `Bang kiem` (dữ liệu từ dòng 3) | 41.799 (bỏ thêm 36 dòng trống) | 41.799 dòng `import_details.csv` | 0 |
| `chuan-bi/mau-nap-du-lieu.xlsx` | `Huong dan` | — | — | không nạp |

Số đo ngày 29/10/2026 (chạy với bản đề xuất đối chiếu chưa duyệt, xem mục "Trạng thái").

## Thực thể & quan hệ
- `import_plans` (1) —< (n) `import_details` qua `tk_number` (`import_details.tk_number` rỗng = dòng không có phiếu; bảng chính cho phép `plan_id` null theo D-011).
- Mọi `tk_number` trong `import_details` đều có trong `import_plans` (đã kiểm: 0 dòng treo).
- Hai CSV là bảng tạm (tên cột = tên cột `public.import_plans` / `public.import_details`, mọi cột là text). Lead chạy SQL insert-select để đổi tên thành id.
- Các danh mục (Phân loại VC, Loại hình xuất, Mặt hàng, ĐVT, Nhà xe, NV xuất, Đơn vị nhận hàng) lưu bằng **tên chuẩn** trong CSV; Lead tra tên -> id khi insert.

## Quy trình & lệnh
```
python -I data/scripts/import_nhap_lieu.py --test      # tự kiểm tra: số TK, đảo ngày, đọc số, ...
python -I data/scripts/import_nhap_lieu.py --mapping   # tạo data/clean/doi-chieu.xlsx (từ chối ghi đè nếu đã có; thêm --force để ghi đè)
python -I data/scripts/import_nhap_lieu.py --build     # đọc doi-chieu.xlsx (đã duyệt) -> CSV
```
`data/scripts/danh-muc-hien-co.txt` là ảnh chụp danh mục đang có trên DB (29/10/2026), dùng cho cột "Có sẵn trên DB?" và để khớp tên. Cần cập nhật nếu DB đổi trước khi chạy lại `--mapping`.

### Trạng thái
`data/clean/doi-chieu.xlsx` **đã được người dùng duyệt (29/10/2026)** với một thay đổi (Xe thuê -> Xe ngoài DDC); các CSV là **bản chính thức**. Không chạy lại `--mapping --force` (sẽ mất bản đã duyệt).

## File đối chiếu `data/clean/doi-chieu.xlsx`
Mỗi sheet một danh mục: `Phân loại VC`, `Loại hình xuất`, `Mặt hàng`, `ĐVT`, `Nhà xe`, `NV xuất` (gộp NV xuất TP/BTP + NV xuất VT + NV xuất hàng bảng kiểm), `Đơn vị nhận hàng`.

| Cột | Ý nghĩa |
|---|---|
| A `Giá trị trong file` | Giá trị gốc đã bỏ khoảng trắng thừa, chuẩn Unicode NFC (khóa tra cứu khi `--build`, không sửa) |
| B `Số dòng` | Số lần xuất hiện |
| C `Đề xuất mục chuẩn` | **Người dùng sửa cột này.** Trống = để trống trường đó khi nạp. Nhiều dòng cùng giá trị ở cột C = gộp |
| D `Có sẵn trên DB?` | `Có` / `Không` (sẽ tạo mới) / `không rõ` (Đơn vị nhận: DB không liệt kê) — tính trên đề xuất, so không phân biệt hoa/thường |
| E `Ghi chú` | `đoán — kiểm lại` = đề xuất dựa trên suy đoán; `cần xác nhận` = chưa chắc; ô C tô vàng |

Quy tắc đề xuất: bỏ khoảng trắng thừa; `>>` -> `->`; `2- X`/`12-X` -> `2 - X`/`12 - X`; khớp mục DB không phân biệt hoa/thường và dấu cách; biến thể `vật tư`/`VT`/`VÂT TƯ`... -> `9 - Vật tư phụ, BHLĐ, VLH`; ĐVT gộp hoa/thường về dạng chuẩn; tên người khớp DB không phân biệt hoa/thường/dấu, gần đúng thì ghi `đoán`; mục chưa có trên DB mà chỉ khác hoa/thường thì gộp về dạng xuất hiện nhiều nhất.

Không đưa vào file duyệt: **Số xe** (chỉ bỏ khoảng trắng thừa), **Tên tài xế** (bỏ khoảng trắng; nếu viết toàn HOA hoặc toàn thường -> Title Case kiểu Việt), **Mã công trình** (bỏ khoảng trắng, giữ nguyên chữ hoa/thường).

## Bảng: `import_plans.csv` (UTF-8, không BOM, phân cách `,`, ô trống = rỗng)
| Cột | Kiểu | Bắt buộc | Duy nhất | Mô tả (VN) | Cột gốc | Quy tắc chuẩn hóa |
|---|---|---|---|---|---|---|
| tk_number | text | có | có | Số phiếu thống kê | `Số phiếu TK` (Nhap phieu) hoặc `Số phiếu TK` (Bang kiem) với phiếu tự tạo | Kiểu mới `TKyyyy/m-n` -> `TKyyyy/mm-nnn`. Kiểu cũ `TKyy/mm-nnnn` giữ nguyên, viết HOA |
| tk_year | int | có | (cùng tk_month, tk_seq) | Năm của số TK | suy từ số TK | Kiểu cũ: 2000 + yy |
| tk_month | int | có | | Tháng của số TK (1–12) | suy từ số TK | |
| tk_seq | int | có | | Thứ tự (1–999 kiểu mới, 1–9999 kiểu cũ) | suy từ số TK | |
| export_date | date `yyyy-mm-dd` | không | | Ngày xuất | `Ngày xuất` | Đọc ngày kiểu datetime hoặc chữ `d/m/yyyy`; đảo ngày/tháng khi chắc (xem dưới). Phiếu tự tạo = ngày nhỏ nhất của các dòng bảng kiểm thuộc phiếu |
| transport_order_no | text | không | | Số lệnh vận chuyển | `Số lệnh VC` | bỏ khoảng trắng |
| transport_type | text | không | | Phân loại VC (tên danh mục) | `Phân loại VC` | qua `doi-chieu.xlsx` |
| vehicle | text | không | | Số xe | `Số xe` | bỏ khoảng trắng |
| driver | text | không | | Tên tài xế/phụ xe | `Tên tài xế/ phụ xe` | Title Case nếu toàn HOA/thường |
| fg_exporter | text | không | | NV xuất TP/BTP (nhiều người cách `;`) | `NV xuất TP/BTP` | qua `doi-chieu.xlsx` (sheet `NV xuất`) |
| material_exporter | text | không | | NV xuất VT (nhiều người cách `;`, theo thứ tự) | `NV xuất VT` | như trên |
| note | text | không | | Ghi chú | `Ghi chú` | bỏ khoảng trắng |
| is_stub | `true`/`false` | có | | `true` = phiếu tự tạo vì số TK chỉ có trong bảng kiểm | — | các trường khác của phiếu tự tạo để trống |
| source_row | int | không | | Số dòng trong sheet `Nhap phieu` (trống với phiếu tự tạo) | — | |

Thứ tự dòng: phiếu thật theo thứ tự file, sau đó phiếu tự tạo theo (năm, tháng, thứ tự).

## Bảng: `import_details.csv`
| Cột | Kiểu | Bắt buộc | Duy nhất | Mô tả (VN) | Cột gốc | Quy tắc chuẩn hóa |
|---|---|---|---|---|---|---|
| import_ref | text | có | có | Khóa nạp lại không trùng: `BK-<số dòng excel>` | — | |
| tk_number | text | không | | Số phiếu TK (rỗng = không có phiếu) | `Số phiếu TK` | như trên. Số TK dạng lạ (`TK23/01-0001A`, `TK1899/...`) -> rỗng, TK gốc ghi thêm vào `note` và `_tk_odd.csv` |
| export_date | date | không | | Ngày xuất | `Ngày xuất` | như trên |
| warehouse_slip_no | text | không | | Số phiếu xuất kho | `Số phiếu xuất kho` | |
| construction_code | text | không | | Mã công trình | `Mã công trình` | giữ nguyên chữ |
| work_item | text | không | | Hạng mục | `Hạng mục` | (hiện toàn trống) |
| delivery_unit | text | có | | Đơn vị giao hàng | `Đơn vị giao hàng` | trống -> `An Hạ` |
| receiving_unit | text | không | | Đơn vị nhận hàng | `Đơn vị nhận hàng` | qua `doi-chieu.xlsx` |
| export_type | text | không | | Loại hình xuất | `Loại hình xuất` | qua `doi-chieu.xlsx`; `Chọn` và chữ tiêu đề `Loại hình xuất` coi như trống |
| product | text | không | | Mặt hàng | `Mặt hàng` | qua `doi-chieu.xlsx`; chữ tiêu đề `Mặt hàng` coi như trống |
| unit | text | không | | ĐVT | `ĐVT` | qua `doi-chieu.xlsx` |
| quantity | numeric | không | | Số lượng xuất | `Số lượng xuất` | số thật, dấu chấm thập phân, làm tròn 3 số lẻ (DB `numeric(18,3)`) |
| total_weight_kg | numeric | không | | Tổng khối lượng, kg | `Tổng khối lượng (kg)` | như trên |
| shipper | text | không | | NV xuất hàng (rỗng = theo phiếu) | `NV xuất hàng` | qua `doi-chieu.xlsx` (sheet `NV xuất`) |
| carrier | text | không | | Nhà xe | `Nhà xe` | qua `doi-chieu.xlsx` |
| note | text | không | | Ghi chú | `Ghi chú` | |
| source_row | int | có | | Số dòng trong sheet `Bang kiem` | — | |

## Quy tắc chuẩn hóa chung
- **Số TK**: kiểu mới `TKyyyy/m-n` (1–3 chữ số thứ tự) -> `TKyyyy/mm-nnn`; kiểu cũ `TKyy/mm-nnnn` giữ nguyên. Dạng khác (hậu tố `A`/`B`, `,,,`, `.1`, năm `1899`, tháng > 12) là "dạng lạ".
- **Phiếu** (`Nhap phieu`): thiếu số TK hoặc số TK dạng lạ -> `_rejected.csv`; trùng số TK -> giữ dòng đầu, dòng sau vào `_rejected.csv`.
- **Phiếu tự tạo**: số TK có trong `Bang kiem` mà không có trong phiếu đã nạp. Số TK sửa tay theo xác nhận của người dùng (`TK_FIXES` trong script): `TK2004/5-345` -> `TK2024/05-345` (1 dòng bảng kiểm, gắn vào phiếu thật dòng 2298 của Nhap phieu, không còn phiếu tự tạo; ghi trong `_tk_odd.csv`).
- **Ngày**: datetime hoặc chữ `d/m/yyyy` (thứ tự ngày/tháng). **Đảo ngày/tháng chỉ khi chắc**: dòng có số TK hợp lệ, ngày <= 12, tháng hiện tại không khớp tháng của số TK, và đảo xong cả tháng lẫn năm khớp số TK. Ghi vào `_date_fixes.csv`. Ngày không đọc được (`#REF!`) -> trống và ghi vào cùng file. Áp cho cả hai sheet. **Dòng bảng kiểm không có số TK** (ô datetime, ngày <= 12, ngày khác tháng): đảo ngày/tháng khi đảo xong ngày nằm giữa hai dòng "tin cậy" gần nhất (file sắp theo ngày) còn ngày gốc thì không; không khớp cả hai / thiếu lân cận một bên -> giữ nguyên. Dòng tin cậy = ngày dạng chữ, ngày > 12, ngày = tháng, đã đảo theo số TK, hoặc tháng khớp số TK. Cột `reason` của `_date_fixes.csv` phân biệt `theo số TK` / `theo dòng lân cận`.
- **Số dạng chữ**: `1.234,5`, `5,5`, `1.234` đọc theo kiểu VN (`.` nghìn, `,` thập phân); `44.2`, `05.09`, `6.00` (một dấu chấm không theo nhóm 3 số) là thập phân; `32,011.00`, `1,234,567` kiểu Mỹ; không đọc được (`\`, `17,332,8`) -> trống. Số âm -> trống. Mọi ô chữ đã chuyển ghi `_number_fixes.csv` (cột `rule` có "không chắc" khi mơ hồ).
- **Tên người, chữ**: NFC, gộp khoảng trắng, `Chọn` = trống.

## File phụ trong `data/clean/` (đều sinh lại bởi `--build`)
| File | Nội dung |
|---|---|
| `_rejected.csv` | `sheet, source_row, tk_number, reason, raw_values` — dòng không nạp |
| `_date_fixes.csv` | `sheet, source_row, tk_number, original, fixed, kind, reason` — ngày đã đảo (`reason` = `theo số TK` hoặc `theo dòng lân cận`) / không đọc được |
| `_number_fixes.csv` | `sheet, source_row, column, original, converted, rule` — ô số dạng chữ đã chuyển |
| `_tk_collisions.csv` | các (năm, tháng, thứ tự) bị hai số TK khác kiểu chiếm — hiện **rỗng** (0 va chạm) |
| `_tk_odd.csv` | `sheet, source_row, tk_original, action` — dòng bảng kiểm có số TK dạng lạ (22 dòng, coi như không có TK) và dòng đã sửa số TK theo `TK_FIXES` (1 dòng) |

## Kiểm tra (bản nháp 29/10/2026)
- Đọc = nạp + loại: Nhap phieu 16.511 = 16.498 + 13; Bang kiem 41.799 = 41.799 + 0 (script `assert`).
- `tk_number` và (năm, tháng, thứ tự) không trùng trong `import_plans.csv` (21.956 dòng); `import_ref` không trùng.
- Tổng `total_weight_kg` trong `import_details.csv` = 246.043.357,56 kg, bằng tổng tính độc lập từ file gốc (gồm 3 ô chữ đã chuyển).
- Đảo ngày: Nhap phieu 5.820 (theo số TK); Bang kiem 6.251 (theo số TK) + 7.719 (theo dòng lân cận); 508 dòng ứng viên không TK giữ nguyên. Ô số chữ đã chuyển: 190 (187 thập phân kiểu chấm, 1 kiểu Mỹ, 2 không đọc được -> trống).
- Ngày sau 29/10/2026 còn lại: Bang kiem 194 dòng (đều không có TK, tháng 11–12/2026, dòng 34872–41357); Nhap phieu 2 phiếu (`TK2026/10-496`, `TK2026/10-497`, ngày 30/10/2026).
- Bang kiem: 18.112 dòng có số TK, 23.687 dòng không có (gồm 22 dòng TK dạng lạ).

## Vấn đề dữ liệu cần người dùng xác nhận
- Duyệt cột C của `doi-chieu.xlsx`, nhất là các ô tô vàng (đoán): `VT`/`VLH`/`10- BHLĐ` -> mục 9; `KCT` -> 21; `TOLE`/`tole` -> 18; `nhớt`/`NHIÊN LIỆU` -> 11; `16- Bulong/Vít` -> 12; `8- Xuất thuê/mượn` -> 12; `BÁN`/`GCN` ở Phân loại VC; viết tắt tên `NGUYỄN T TRANG`, `NG THỊ TRANG`.
- `16- Hàng ký gửi` (11 dòng): mã 16 không có trong danh mục Loại hình xuất 1–12 — tạo mới hay gộp?
- Nhà xe `Xe thuê` (3.354 dòng) có cùng nghĩa `Xe ngoài DDC` không; `Lê Thuận` (433 dòng) là tên người, đề xuất để trống.
- Tên người chưa có trong DB: `Huỳnh Chí Thanh` (3.625 lượt), `Trịnh Văn Hưng`, `Nguyễn Văn Học`.
- Còn 194 dòng bảng kiểm không có TK mang ngày sau 29/10/2026 (11–12/2026) mà quy tắc lân cận không sửa được: cần người dùng xem (dòng nằm trong `import_details.csv`, lọc `export_date > 2026-10-29`).
- 3 phiếu bị loại vì số TK có năm 1899 (`TK1899/4-144`, `TK1899/4-145`, `TK1899/5-465`, dòng 1568, 1569, 2418 của Nhap phieu) và 6 phiếu thiếu số TK: cần số TK đúng nếu muốn nạp.
- ~~Phiếu tự tạo `TK2004/05-345`~~ đã xử lý: sửa thành `TK2024/05-345` (người dùng xác nhận 29/10/2026).
- 6 dòng bảng kiểm không có ngày xuất (3 trống, 3 `#REF!`): để trống.

## Changelog
- 29/10/2026: Tạo tài liệu. Thêm script `data/scripts/import_nhap_lieu.py` (`--test`, `--mapping`, `--build`), `data/clean/doi-chieu.xlsx`, `import_plans.csv`, `import_details.csv` (bản nháp) và các file `_*.csv` (T-020, D-011).
- 29/10/2026 (2): Theo quyết định của người dùng — (1) thêm đảo ngày theo dòng lân cận cho dòng bảng kiểm không có TK (7.719 dòng; hàm `neighbor_fixes`, có test trong `--test`), thêm cột `reason` vào `_date_fixes.csv`; (2) `TK2004/5-345` -> `TK2024/05-345`, `_tk_odd.csv` đổi cột (`sheet, source_row, tk_original, action`); (3) giữ cách coi ô chữ tiêu đề `Mặt hàng`/`Loại hình xuất` là trống. `doi-chieu.xlsx` chưa duyệt, CSV vẫn là bản nháp.
- 29/10/2026 (3): CSV chính thức, người dùng duyệt đối chiếu. Thay đổi so với đề xuất: Nhà xe 'Xe thuê' -> 'Xe ngoài DDC'. 194 dòng ngày 11-12/2026 và 2 phiếu ngày 30/10/2026 nạp nguyên văn. Kiểm tra: header khớp migration 000005 (14 + 17 cột), không có dấu xuống dòng trong ô, không BOM, 21.956 + 41.799 dòng, tổng 246.043.357,56 kg.

- 29/10/2026 (4) T-026: Người dùng cập nhật `chuan-bi/mau-nap-du-lieu.xlsx`. Sao lưu bản đã nạp thành `data/clean/v1_import_plans.csv`, `v1_import_details.csv` (+ `v1_rejected/_date_fixes/_number_fixes/_tk_odd/_tk_collisions.csv`). Chạy lại `--build` (CSV mới giữ tên cũ, CHƯA nạp). Script `import_nhap_lieu.py` thêm file `_new_catalog_values.csv` khi có giá trị danh mục chưa có trong `doi-chieu.xlsx` (lần này không có). Thêm `data/scripts/diff_import.py` -> `_diff_report.md`, `_diff_plans.csv`, `_diff_details.csv`. Kết quả: phiếu +2 (tự tạo), bảng kiểm 41.799 dòng không dịch dòng, đổi ở cột `tk_number` (23.600 dòng), `warehouse_slip_no` (40.133), `export_date` (574), `note` (1); tổng kg không đổi.

- 29/10/2026 (5) T-032: Người dùng cập nhật `mau-nap-du-lieu.xlsx` lần nữa. Sao lưu bản 2 (đã nạp) thành `data/clean/v2_import_plans.csv`, `v2_import_details.csv` (+ `v2_` cho các `_*.csv`/`_diff_*`; `v2_diff_*` là diff v1 -> v2). Chạy lại `--test` và `--build` (CSV mới giữ tên cũ, CHƯA nạp). `diff_import.py` nay có tham số `--base` (mặc định v2) và `--older` (mặc định v1, để tái tạo nhóm 63 dòng giữ ngày bản 1), ghép dòng theo `import_ref` + kiểm dịch dòng bằng nội dung lõi, cột `flag` đánh dấu nhóm 63 dòng. Kết quả v2 -> mới: phiếu 21.958 giữ nguyên số lượng, 12.534 phiếu đổi `transport_order_no` (12.527 thêm số 0 đầu cho đủ 6 chữ số, 7 kiểu khác); bảng kiểm 41.799 -> 41.801 (+2 dòng cuối `BK-41838/41839` chỉ có số phiếu), 41.787 dòng đổi `warehouse_slip_no` (cột duy nhất đổi), không dịch dòng, không dòng bị xóa; tổng kg 246.043.357,56 không đổi; không có giá trị danh mục mới.