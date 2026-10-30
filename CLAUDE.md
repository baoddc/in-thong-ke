# CLAUDE.md — Hướng dẫn dự án & quy trình đội AI

> File này được Claude Code đọc tự động mỗi phiên. Phiên chính (main session) đóng vai **Lead** và điều phối 4 agent chuyên trách trong `.claude/agents/`.

---

## 1. Tổng quan dự án

- **Tên dự án:** In thống kê
- **Mục tiêu:** Tải dữ liệu nhanh để in và xuất file thống kê.
- **Người dùng chính:** Tất cả người dùng đã được phân quyền (đăng nhập qua Supabase Auth; mỗi vai trò chỉ thấy dữ liệu được cấp).
- **Nguồn dữ liệu đầu vào:** Google Sheets → chuyển (migrate/đồng bộ) sang Supabase. Sau khi chuyển, Supabase là nguồn dữ liệu chính; ứng dụng đọc từ Supabase, không đọc trực tiếp Google Sheets.
- **Ngôn ngữ giao diện:** Tiếng Việt (có dấu, đúng chính tả)

### Yêu cầu trọng tâm
1. **Chuyển dữ liệu Google Sheets → Supabase:** script tái chạy được, không tạo bản ghi trùng khi chạy lại (upsert theo khóa nghiệp vụ), có log số dòng nạp/bỏ qua/lỗi.
2. **Tải nhanh:** trang thống kê hiển thị dưới ~2 giây với dữ liệu thường dùng. Tổng hợp số liệu bằng SQL view/RPC phía database, không tải toàn bộ dòng về trình duyệt rồi mới cộng.
3. **In & xuất file:** bộ lọc (khoảng thời gian, danh mục…) → xem trước bảng thống kê → **In** (trang có CSS `@media print`, khổ A4) và **Xuất file** (mặc định PDF và Excel `.xlsx`).
4. **Phân quyền:** RLS trên mọi bảng; người không có quyền không xem được và không xuất được dữ liệu.

### Nguồn Google Sheets
File **01- KHO AN HẠ** · ID `1mVsdOpsTzb09n7k69tJ3HYPL2m28ogAbN6i1AY1SF3Y` · 12 sheet. Quyết định nguồn nạp: `docs/decisions.md` D-001.

| Sheet | Vai trò |
|---|---|
| `02.BANG KEML CHI TIET` | **Dữ liệu chính — nạp.** Mỗi dòng 1 mặt hàng trên 1 phiếu xuất kho, gắn số phiếu thống kê (TK). Tiêu đề ở dòng 4 |
| `01.KE HOACH & KQ` | **Nạp.** Kế hoạch phân công theo số phiếu TK (lệnh VC, phân loại VC, xe, tài xế, NV xuất) + kết quả (giờ bắt đầu/kết thúc, tình trạng). Tiêu đề ở dòng 4 |
| `DATA` | **Nạp làm bảng danh mục** (dropdown): loại hình xuất, mặt hàng, nơi xuất/nhận, NV kho, xe–nhà xe–tài xế, trạng thái, phân loại VC, dự án, công trình |
| `03.PHIEU IN` | Mẫu in "Thống kê bàn giao phiếu xuất kho" (= `mau-phieu-in.pdf`), lấy mọi trường từ `02` theo số phiếu TK — làm lại trên web, không nạp |
| `04.TRANG NHUNG`, `05.TH DU LIEU` | Bản sao dữ liệu của `02` — không nạp |
| `Chart`, `BAO CAO` | Tổng hợp khối lượng theo loại hình xuất — dùng để **đối chiếu** tổng sau khi chuyển, không nạp |
| `Note` | Ghi chú việc cần chuẩn hóa — đọc làm yêu cầu, không nạp |
| `Bão - 03.PHIEU IN`, `Trang tính9`, `TẠO FILE` | Phụ trợ (bản in khác, tra mã CT, QR) — không nạp |

**Cột của `02.BANG KEML CHI TIET` (A→AG):** Ngày xuất · BC tuần · Năm/tháng · STT · Ngày · Tháng · Năm · Số phiếu thống kê · Số lệnh vận chuyển · Số phiếu xuất kho · Mã CT · Tên công trình · Hạng mục · Đơn vị giao hàng · Đơn vị nhận hàng · Loại hình xuất · Mặt hàng · ĐVT · Số lượng xuất (PCS) · Tổng khối lượng · NV xuất hàng · Số xe · Tên tài xế/ phụ xe · Nhà xe · Ghi chú · PXK Theo Ngày · Mã DA cũ · Tên DA cũ · Nhóm chứng từ · Số thống kê nhóm xuất hàng · (trống) · Tên file lưu hình ảnh · Link liên kết

**Lỗi dữ liệu đã thấy (data-analyst phải xử lý):**
- Cột tính sẵn (`BC tuần`, `Năm/tháng`, `Ngày`, `Tháng`, `Năm`) → không lưu, tính lại từ `Ngày xuất`.
- ~6.500 dòng cuối của `02` chỉ có `BC tuần` (công thức thừa, không có ngày xuất) → loại, ghi vào `_rejected.csv`.
- Số định dạng Việt Nam dạng text (`5.422,00`, `  5,00 `) → chuyển sang `numeric`.
- Danh mục viết không thống nhất: Nhà xe (`Xe thuê`/`XE THUÊ`, `xe máy`/`XE MÁY`/`Xe máy`), ĐVT (`kg`/`KG`, `m`/`M`, `bộ`/`Bộ`) → bảng danh mục chuẩn.
- Tên tài xế ghi nhiều kiểu cho cùng một người/xe (`TX ĐƯỢC`, `tx được`; `TRẦN MINH HẢI`/`TRẦN HỒNG HẢI` cùng số xe) → lập bảng tài xế, đưa trường hợp nghi trùng cho người dùng xác nhận.
- Sheet `Note` yêu cầu chuẩn hóa: Nhóm mặt hàng, Đơn vị nhận hàng, Nhà xe, Tên tài xế, Số xe; bổ sung Mã DA; bổ sung kế hoạch phân công và số phiếu thống kê.
- Loại hình xuất có mã đánh số (`1- Điều chuyển nội bộ` … `11- Xuất khác`) → bảng `export_types` (mã + tên). Giá trị `Chọn` là ô chưa chọn → coi như trống.
- **Kiểm tra sau khi chuyển:** tổng `Tổng khối lượng` theo từng loại hình xuất phải khớp sheet `Chart`.
- Đọc toàn bộ file bằng Google Sheets API hoặc export `.xlsx` — **không** dùng bản xem trước dạng text vì nó bỏ ô trống làm lệch cột. Sheet đang bật chia sẻ bằng link nên `https://docs.google.com/spreadsheets/d/<ID>/export?format=xlsx` tải được không cần đăng nhập (~30 MB; Drive API từ chối vì quá lớn). Bản tải ngày 29/10/2026: `data/raw/kho-an-ha_2026-10-29.xlsx`.

### Việc còn cần xác nhận (agent ghi TODO, không tự đoán)
- Còn file Google Sheet nào khác cần chuyển không (kho khác ngoài Kho An Hạ? file `1EUCZO9MkpD67AuVOh9ZdGHnZTTunSatRAgfCm9okqok` mà sheet `TẠO FILE` trỏ tới?)
- Các mẫu thống kê cần in ngoài phiếu `03.PHIEU IN` (cột nào, nhóm theo gì, tổng ở đâu)
- Danh sách vai trò chi tiết và mỗi vai trò được xem dữ liệu nào (v1: một vai trò — D-003)
- ~~Chuyển một lần hay đồng bộ định kỳ~~ → đã chốt: chuyển một lần, sau đó nhập liệu trên web (D-002)

## 2. Tech stack mặc định

| Lớp | Công nghệ |
|---|---|
| Front-end | React 18 + Vite + TypeScript, Tailwind CSS, React Router, TanStack Query |
| Back-end | Supabase (PostgreSQL, Auth, Row Level Security, Edge Functions) |
| Xử lý dữ liệu | Python 3 (pandas, openpyxl) hoặc Node (xlsx, papaparse) |
| Đọc Google Sheets | Google Sheets API (service account, chỉ quyền đọc) hoặc link export CSV cho sheet công khai |
| In & xuất file | CSS `@media print` (A4), ExcelJS cho `.xlsx`, PDF qua in trình duyệt hoặc `@react-pdf/renderer` |
| Kiểm thử | Vitest + Testing Library (FE), pgTAP / SQL test (DB), Playwright (E2E) |
| Chất lượng code | ESLint, Prettier, `tsc --noEmit` |

Đổi stack thì sửa bảng này **trước**, rồi mới giao việc cho agent.

## 3. Cấu trúc thư mục

```
/
├── CLAUDE.md
├── .claude/agents/          # định nghĩa 5 agent
├── docs/                    # "bảng giao tiếp" giữa các agent
│   ├── plan.md              # Lead: kế hoạch, task, trạng thái
│   ├── data-spec.md         # Data: cấu trúc & quy tắc chuẩn hóa
│   ├── api-contract.md      # Backend: bảng, endpoint, kiểu dữ liệu
│   ├── decisions.md         # Lead: nhật ký quyết định (ADR ngắn)
│   └── test-report.md       # Tester: kết quả kiểm thử, lỗi
├── data/
│   ├── raw/                 # file gốc — KHÔNG sửa
│   ├── clean/               # dữ liệu đã chuẩn hóa (CSV/JSON)
│   └── scripts/             # script đọc & làm sạch
├── supabase/
│   ├── migrations/          # file SQL đánh số theo thời gian
│   ├── functions/           # Edge Functions
│   └── seed.sql
├── src/                     # Front-end
│   ├── components/ pages/ hooks/ lib/ types/
└── tests/                   # unit, integration, e2e
```

## 4. Đội agent & phạm vi quyền

| Agent | File | Được sửa | Không được sửa |
|---|---|---|---|
| **Lead** (phiên chính) | — | `docs/plan.md`, `docs/decisions.md`, `CLAUDE.md` | Code nghiệp vụ (giao cho agent) |
| **lead-planner** | `lead.md` | `docs/plan.md`, `docs/decisions.md` | Mọi code |
| **data-analyst** | `data-analyst.md` | `data/`, `docs/data-spec.md` | `src/`, `supabase/` |
| **backend** | `backend.md` | `supabase/`, `docs/api-contract.md`, `src/types/database.ts` | `src/` còn lại, `data/raw/` |
| **frontend** | `frontend.md` | `src/` (trừ `types/database.ts`) | `supabase/`, `data/` |
| **tester** | `tester.md` | `tests/`, `docs/test-report.md` | Code sản phẩm — chỉ báo lỗi, không tự sửa |

> Lưu ý kỹ thuật: agent con trong Claude Code **không thể gọi agent con khác**. Vì vậy việc điều phối do phiên chính đảm nhận; `lead-planner` dùng để lập kế hoạch và review khi cần một góc nhìn độc lập.

## 5. Quy trình làm việc (Lead điều phối)

```
1. TIẾP NHẬN   → Lead đọc yêu cầu, gọi lead-planner lập docs/plan.md
2. DỮ LIỆU     → data-analyst đọc file/link → docs/data-spec.md + data/clean/
3. BACK-END    → backend dựa trên data-spec → migrations + api-contract.md
4. FRONT-END   → frontend dựa trên api-contract → giao diện
                 (bước 3 và 4 có thể chạy song song khi api-contract đã chốt)
5. KIỂM THỬ    → tester chạy test → docs/test-report.md
6. SỬA LỖI     → Lead giao lỗi về đúng agent → quay lại bước 5
7. CHỐT        → Lead review theo "Definition of Done", cập nhật plan.md
```

### Quy tắc giao việc cho agent
Mỗi lần gọi agent, Lead phải ghi rõ:
1. **Task ID** trong `docs/plan.md` (vd `T-003`)
2. **Đầu vào**: file/tài liệu cần đọc
3. **Đầu ra**: file phải tạo/sửa
4. **Tiêu chí hoàn thành**: kiểm tra được bằng lệnh hoặc quan sát
5. **Ràng buộc**: những gì không được động vào

Agent con không thấy lịch sử hội thoại — mọi ngữ cảnh cần thiết phải nằm trong lời giao việc hoặc trong `docs/`.

### Quy tắc bàn giao (handoff)
- Agent kết thúc bằng **báo cáo ngắn**: đã làm gì, file nào thay đổi, lệnh kiểm tra, vấn đề còn tồn.
- Thay đổi "hợp đồng" (`data-spec.md`, `api-contract.md`) phải ghi mục **Changelog** ở cuối file đó và báo Lead.
- Không agent nào tự ý đổi hợp đồng của agent khác.

## 6. Quy ước code

- TypeScript `strict: true`; không dùng `any` trừ khi có comment giải thích.
- Tên biến/hàm/bảng/cột: **tiếng Anh, snake_case cho DB, camelCase cho TS**. Nhãn hiển thị: tiếng Việt.
- Mỗi bảng DB có: `id uuid`, `created_at`, `updated_at`; bật **RLS** cho mọi bảng.
- Không hard-code secret; dùng `.env.local` (không commit) và `.env.example`.
- Số liệu: đơn vị ghi rõ trong tên cột hoặc comment (`weight_kg`, `length_mm`).
- Ngày giờ: lưu `timestamptz` (UTC), hiển thị theo `Asia/Ho_Chi_Minh`, định dạng `dd/MM/yyyy`.
- Số hiển thị theo kiểu Việt Nam: `1.234.567,89`.
- Commit message: `<loại>(<phạm vi>): <mô tả>` — vd `feat(kho): thêm bộ lọc theo mã cuộn`.

## 7. Lệnh thường dùng

```bash
npm run dev              # chạy front-end
npm run build            # build production
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit
npm run test             # Vitest
npx playwright test      # E2E
supabase start           # Supabase local
supabase db reset        # áp lại migrations + seed
supabase gen types typescript --local > src/types/database.ts
python data/scripts/<script>.py   # chạy script chuẩn hóa
```

## 8. Definition of Done (Lead kiểm trước khi chốt task)

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` đều qua
- [ ] Migration chạy sạch từ đầu (`supabase db reset`)
- [ ] `docs/test-report.md` không còn lỗi mức **Cao** đang mở
- [ ] Hợp đồng (`data-spec`, `api-contract`) khớp với code thực tế
- [ ] Giao diện hiển thị đúng tiếng Việt, chạy được trên màn hình 375px
- [ ] `docs/plan.md` cập nhật trạng thái task

## 9. Những điều KHÔNG làm

- Không sửa hoặc xóa file trong `data/raw/`.
- Không chạy lệnh xóa dữ liệu trên database thật (production) khi chưa có xác nhận của người dùng.
- Không cài thêm thư viện lớn khi chưa ghi lý do vào `docs/decisions.md`.
- Không bịa dữ liệu: thiếu thông tin thì ghi `TODO` và hỏi Lead.
