# API Contract

Cột "Ai được đọc/ghi" của các bảng nghiệp vụ dưới đây ghi "authenticated" theo v1; từ D-013 (`20261030000009_profiles_roles.sql`) thực tế là người dùng hoạt động, sửa/xóa phiếu & dòng kiểm chỉ người tạo trong 24 giờ hoặc admin — bảng phân quyền ngay dưới mục Bảng/View là bản đúng.

Migration: `supabase/migrations/20261029000001_transport_plans.sql`, `20261029000002_bigint_ids.sql` (D-007: mọi `id` là `bigint` identity), `20261029000003_inspection_details.sql` (D-008), `20261029000004_inspection_shipper.sql` (D-009, D-010), `20261029000005_legacy_import.sql` (D-011), `20261029000006_perf_stats.sql` (T-023: trigram index, `inspection_weight_total`), `20261029000007_scale.sql` (T-028, D-012: RPC tìm kiếm, bảng tổng hợp, `inspection_stats`, index phân trang; xem `docs/performance.md`), `20261029000008_inspection_tk_search.sql` (T-031: `inspection_details.tk_number`, tìm danh mục không dấu). Kiểu TS: `src/types/database.ts` (viết tay, sẽ sinh lại bằng `supabase gen types` khi có CLI).

## Bảng / View
| Tên | Cột chính | Ai được đọc | Ai được ghi |
|---|---|---|---|
| `lookup_items` | `id`, `kind` (`transport_type` Phân loại VC, `vehicle` Số xe, `driver` Tài xế, `fg_exporter` NV xuất TP/BTP, `material_exporter` NV xuất VT, `construction` Công trình, `delivery_unit` Đơn vị giao hàng, `receiving_unit` Đơn vị nhận hàng, `export_type` Loại hình xuất, `product` Mặt hàng, `unit` ĐVT, `carrier` Nhà xe), `name` (đã trim, không rỗng), `code` (null hoặc đã trim, không rỗng; `construction`: code = Mã CT, name = Tên CT). Unique `(kind, lower(code))` khi code không null; unique `(kind, lower(name))` **chỉ áp cho kind khác `construction`** (D-009: công trình lấy mã làm khóa, tên được trùng; index `lookup_items_kind_name_uq` có `where kind <> 'construction'`). Có sẵn `('delivery_unit','An Hạ')` | người dùng hoạt động | insert: người dùng hoạt động; update/delete: admin (xem "Phân quyền theo vai trò") |
| `inspection_details` | Bảng kiểm chi tiết, mỗi dòng 1 mặt hàng trên 1 phiếu. `id`, `plan_id` (FK `transport_plans`, restrict, **nullable** từ D-011: chỉ dòng nạp từ dữ liệu cũ mới được trống; nhập mới trên web vẫn phải chọn số TK - FE kiểm), `import_ref` (text, unique khi không null; khóa nạp lại dữ liệu cũ, dòng nhập tay để null), `export_date`, `tk_number` (text, **chỉ đọc**: bản sao số TK của phiếu do trigger `inspection_details_fill_tk` điền khi insert/đổi `plan_id`; FE KHÔNG ghi; null khi không có phiếu; từ 000008), `warehouse_slip_no` (Số phiếu xuất kho), `construction_id`, `delivery_unit_id`, `receiving_unit_id`, `export_type_id`, `product_id`, `unit_id`, `carrier_id`, `shipper_id` (FK `lookup_items`, restrict; `shipper_id` = NV xuất hàng chọn riêng cho dòng, kind `fg_exporter`/`material_exporter` kiểm ở FE, null = theo phiếu - D-010), `work_item` (Hạng mục), `quantity` numeric(18,3) >= 0, `total_weight_kg` numeric(18,3) >= 0, `note`, `created_by`, `updated_by` (uuid, người sửa lần cuối - trigger đặt, FE không ghi; từ 000011), `created_at`, `updated_at` | authenticated | authenticated (insert/update/delete trực tiếp, không cần RPC) |
| `inspection_details_view` (view) | `id, plan_id, tk_number, transport_order_no, export_date, warehouse_slip_no, construction_id, construction_code, construction_name, work_item, delivery_unit_id, delivery_unit_name, receiving_unit_id, receiving_unit_name, export_type_id, export_type_name, product_id, product_name, unit_id, unit_name, quantity, total_weight_kg, shipper_name, vehicle_name, driver_name, carrier_id, carrier_name, note, created_at, updated_at, shipper_id, plan_shipper_name, created_by, updated_by` (uuid người tạo từ 000009; uuid người sửa lần cuối, cột cuối từ 000011, null = chưa ai sửa/dữ liệu cũ). `security_invoker` (RLS theo người gọi). Từ D-011 nối phiếu bằng `left join`: dòng không có phiếu có `plan_id`, `tk_number`, `transport_order_no`, `vehicle_name`, `driver_name`, `plan_shipper_name` = null (`shipper_name` vẫn là người được chọn riêng nếu có). Số lệnh VC, xe, tài xế, `shipper_name` lấy từ phiếu (không lưu bản sao). `plan_shipper_name` = NV xuất TP/BTP của phiếu; nếu trống thì NV xuất VT có `sort_order` nhỏ nhất (hòa: `lookup_id` nhỏ nhất). `shipper_id` = người được chọn riêng cho dòng (null = theo phiếu); `shipper_name = coalesce(tên shipper_id, plan_shipper_name)` | authenticated | không ghi (ghi vào `inspection_details`) |
| `transport_plans` | `id`, `tk_number` (unique, vd `TK2026/10-005`), `tk_year`, `tk_month`, `tk_seq` (1..9999 từ D-011 để giữ số TK kiểu cũ; số mới do `tk_next_seq` vẫn chỉ cấp 1..999), `export_date`, `transport_order_no`, `transport_type_id`, `vehicle_id`, `driver_id`, `fg_exporter_id` (FK `lookup_items`, on delete restrict), `note`, `created_by`, `updated_by` (người sửa lần cuối - trigger đặt, từ 000011), `created_at`, `updated_at` | authenticated | authenticated; **nên tạo/sửa qua RPC**; số phiếu không đổi được (trigger báo lỗi) |
| `transport_plan_material_exporters` | `plan_id` (cascade khi xóa phiếu), `lookup_id` (restrict), PK `(plan_id, lookup_id)`, `sort_order` (int, thứ tự chọn, 0 = đầu; dữ liệu cũ 0), `created_at` | authenticated | authenticated (nên qua RPC) |
| `tk_reservations` (D-018, 000013) | Chỗ giữ số phiếu TK: `id`, `tk_year`, `tk_month`, `tk_seq` (1..999), `user_id` (FK `auth.users`, cascade; mặc định `auth.uid()`), `expires_at`, `created_at`, `updated_at`. Unique `(tk_year, tk_month, tk_seq)` và unique `(user_id)` (mỗi người giữ tối đa 1 số). Dòng quá hạn coi như không tồn tại | chỉ dòng của mình | thêm/sửa: chỉ qua RPC `reserve_tk_number`; xóa: dòng của mình (policy delete) hoặc `release_tk_reservation` |
| `edit_requests` (D-019, 000014; D-020, 000015) | Yêu cầu sửa phiếu hoặc dòng bảng kiểm quá 24 giờ: `id` (bigint identity), `plan_id` (nullable từ 000015; FK `edit_requests_plan_id_fkey` -> `transport_plans`, cascade), `detail_id` (bigint, nullable, từ 000015; FK `edit_requests_detail_id_fkey` -> `inspection_details`, cascade; check `edit_requests_target_check`: `num_nonnulls(plan_id, detail_id) = 1`, tức đúng một trong hai; unique partial `(detail_id, requested_by) where status='pending' and detail_id is not null`; index `detail_id`), `requested_by` (uuid, FK `edit_requests_requested_by_fkey` -> `profiles`), `reason` (text, trim 1..500), `status` (`pending`\|`approved`\|`rejected`, mặc định `pending`), `decided_by` (uuid, FK `edit_requests_decided_by_fkey` -> `profiles`), `decided_at`, `decision_note`, `unlock_until` (timestamptz; = lúc duyệt + 24 giờ khi `approved`, null khi từ chối/chờ), `created_at`, `updated_at`. Unique partial `(plan_id, requested_by) where status='pending'`; index `(status, created_at desc)`, `(requested_by, plan_id)`. Đang mở khóa = `status='approved' and unlock_until > now()` | `requested_by = chính mình`, hoặc admin/root (tất cả) | không ai ghi trực tiếp (không policy insert/update/delete): tạo qua RPC `request_plan_edit` (phiếu) / `request_detail_edit` (dòng), duyệt qua `decide_edit_request`. Có trong publication `supabase_realtime` (từ 000015, xem mục Realtime) |
| `inspection_daily_stats` | Bảng tổng hợp (D-012): `id`, `export_date` (null = dòng không có ngày), `export_type_id`, `product_id` (null được; không có FK), `row_count` bigint, `quantity_sum` numeric, `weight_kg_sum` numeric (kg), `created_at`, `updated_at`. Unique `nulls not distinct (export_date, export_type_id, product_id)`. Trigger trên `inspection_details` tự cập nhật; dựng lại bằng `rebuild_inspection_daily_stats()` (chỉ postgres) | authenticated (chỉ select) | không ai ghi trực tiếp (chỉ trigger security definer) |

| `profiles` (D-013, 000009) | `id` (= `auth.users.id`, cascade), `username` (unique không phân biệt hoa thường; dạng `[a-z0-9]+(.[a-z0-9]+)*`), `full_name`, `role` (`root`\|`admin`\|`user`; tối đa 1 `root`, D-014), `is_active`, `is_pending` (D-015, 000011: tự đăng ký đang chờ duyệt; check `not is_pending or not is_active`), `created_by` (uuid, admin/root tạo tài khoản; null = tự đăng ký/dữ liệu cũ), `approved_by` (uuid, người duyệt; null + `approved_at` có giá trị = tài khoản cũ, không rõ người duyệt), `approved_at` (D-016), `created_at`, `updated_at` | chính mình; root đọc tất cả; admin đọc user + chính mình | không ai từ FE (chỉ Edge Function `admin-users` bằng service role) |

anon: không có quyền gì trên các bảng và view. RLS bật mọi bảng.

### Phân quyền theo vai trò (D-013, thay v1/D-003)
Hàm `public.is_active_user()` (có profile và `is_active`) , `public.is_admin()` (thêm `role in ('admin','root')`: root có quyền dữ liệu như admin, D-014) và `public.is_root()` (`role = 'root'`) — `security definer`, `authenticated` gọi được, trả `boolean`. Tài khoản không có profile hoặc bị khóa: `is_active_user()` = false nên RLS chặn mọi bảng nghiệp vụ (đọc trả rỗng, ghi lỗi `42501`).

| Bảng | select / insert | update | delete |
|---|---|---|---|
| `lookup_items` | user | **admin** | **admin** |
| `transport_plans`, `inspection_details` | user (thêm dòng kiểm vào phiếu của người khác được) | **người tạo trong 24 giờ, hoặc admin, hoặc người tạo có yêu cầu sửa đã duyệt còn hạn (D-019, `can_update_row`)** | **người tạo trong 24 giờ, hoặc admin** (duyệt yêu cầu sửa KHÔNG mở quyền xóa) |
| `transport_plan_material_exporters` | select: user | insert/update/delete: chỉ khi sửa được phiếu cha (`can_edit_plan`, từ 000014 tính cả mở khóa) | như update |
| `edit_requests` | chính mình / admin | - (chỉ RPC) | - |
| `inspection_daily_stats` | user (chỉ đọc) | - | - |
| `profiles` | chính mình / admin | - | - |

**Quy tắc sửa/xóa theo người tạo:** `public.can_edit_row(p_created_by uuid, p_created_at timestamptz)` = `is_admin()` hoặc (`is_active_user()` và `created_by = auth.uid()` và `created_at > now() - 24 giờ`); `public.can_edit_plan(p_plan_id bigint)` = `can_edit_row` áp lên phiếu cha. Cả hai `security definer`, `authenticated` gọi được, trả `boolean`. Quá 24 giờ chỉ admin. Sửa/xóa không đủ quyền: PostgREST trả **0 dòng, không lỗi** (FE nên kiểm số dòng bị ảnh hưởng, vd `.select()` sau `update/delete`); RPC `update_transport_plan` báo `P0002` "Không tìm thấy phiếu hoặc bạn không có quyền sửa (chỉ người tạo trong 24 giờ hoặc admin)".
**Chống giả mạo:** trigger BEFORE INSERT/UPDATE trên `transport_plans` và `inspection_details`: khi có `auth.uid()`, `created_by := auth.uid()` và `created_at := now()` lúc thêm, và không sửa được hai cột này sau đó (FE gửi gì cũng bị bỏ qua). Từ 000011 (D-016) cùng trigger đặt `updated_by := null` lúc thêm và `updated_by := auth.uid()` mỗi lần sửa (FE không ghi được; cập nhật từ SQL Editor khi `auth.uid()` null không đổi `updated_by`). Khi `auth.uid()` null (SQL Editor / service role) được đặt tay — dùng để gán chủ dữ liệu đã nạp (`supabase/import/assign_owner_bao_lt.sql`). `inspection_details_view.created_by` (cột cuối) cho FE biết người tạo: nút Sửa/Xóa hiện khi `role = 'admin'` hoặc (`created_by = userId` và `created_at` trong 24 giờ); quyền thật do RLS.

**Cập nhật D-020 (000015):** `can_update_row` nay có 4 tham số `(p_created_by uuid, p_created_at timestamptz, p_plan_id bigint, p_detail_id bigint default null)`; bản 3 tham số bị xóa (chỉ còn một overload). Điều kiện mở khóa = `can_edit_row` hoặc (`is_active_user()`, `p_created_by = auth.uid()` và có `edit_requests` của mình `approved`, `unlock_until > now()`, với `plan_id = p_plan_id` HOẶC `detail_id = p_detail_id`). Policy UPDATE `inspection_details` = `can_update_row(created_by, created_at, plan_id, id)` (using + with check): duyệt yêu cầu **dòng** mở đúng dòng đó (kể cả dòng không gắn phiếu, `plan_id` null); duyệt yêu cầu **phiếu** vẫn mở các dòng do mình tạo thuộc phiếu. `transport_plans` và `can_edit_plan` gọi với `p_detail_id` null. Xóa vẫn chỉ `can_edit_row`.

**Mở khóa sửa quá 24 giờ (D-019, 000014):** `public.can_update_row(p_created_by uuid, p_created_at timestamptz, p_plan_id bigint)` = `can_edit_row(...)` hoặc (`is_active_user()` và `p_created_by = auth.uid()` và `p_plan_id` không null và có `edit_requests` của mình cho phiếu đó với `status='approved'` và `unlock_until > now()`). Policy UPDATE của `transport_plans` dùng `can_update_row(created_by, created_at, id)`, của `inspection_details` dùng `can_update_row(created_by, created_at, plan_id)` (cả using và with check; with check xét `plan_id` mới nên không chuyển dòng sang phiếu chưa mở khóa để lách). Vì vậy người tạo sửa được **phiếu** và **các dòng do chính mình tạo** thuộc phiếu đó; dòng do người khác tạo, dòng không gắn phiếu (`plan_id` null) không được mở. `can_edit_plan` (bảng nối NV xuất VT, `update_transport_plan`) cũng dùng `can_update_row`. FE: hiện nút Sửa khi `can_edit_row` cũ đúng, hoặc có `edit_requests` approved với `unlock_until` > bây giờ (chỉ để ẩn/hiện, RLS mới là chốt chặn).

"user" = `is_active_user()` (admin cũng thỏa). FE nên ẩn nút sửa/xóa Danh mục và nút xóa theo `profiles.role`, nhưng quyền thực sự do RLS. Đọc vai trò hiện tại: `supabase.from('profiles').select('*').eq('id', userId).single()`.

Tên FK để embed: `transport_plans_transport_type_id_fkey`, `transport_plans_vehicle_id_fkey`, `transport_plans_driver_id_fkey`, `transport_plans_fg_exporter_id_fkey`; `inspection_details_plan_id_fkey`, `inspection_details_<cột>_fkey` (`construction_id`, `delivery_unit_id`, `receiving_unit_id`, `export_type_id`, `product_id`, `unit_id`, `carrier_id`, `shipper_id`); `tpme_plan_id_fkey` (-> `transport_plans`, cascade), `tpme_lookup_id_fkey` (-> `lookup_items`, restrict) của `transport_plan_material_exporters`.

Bảng kiểm chi tiết - đọc (phân trang) và ghi:
```ts
const { data } = await supabase
  .from('inspection_details_view')
  .select('*')
  .order('created_at', { ascending: false })
  .range(0, 49)

await supabase.from('inspection_details').insert({
  plan_id, export_date: '2026-10-29', warehouse_slip_no: 'PXK-001',
  construction_id, delivery_unit_id, receiving_unit_id, export_type_id,
  product_id, unit_id, carrier_id, work_item: null, quantity: 5, total_weight_kg: 120.5, note: null,
})
```
`created_by` tự điền bằng `auth.uid()`. Muốn đọc lại dòng vừa ghi kèm tên danh mục thì truy vấn lại view theo `id`. Thứ tự NV xuất VT của một phiếu: `select lookup:lookup_items(id,name)` từ `transport_plan_material_exporters` rồi sắp theo `sort_order`.

Đọc phiếu kèm tên danh mục (phân trang bằng `range`):
```ts
const { data } = await supabase
  .from('transport_plans')
  .select(`*,
    transport_type:lookup_items!transport_plans_transport_type_id_fkey(name),
    vehicle:lookup_items!transport_plans_vehicle_id_fkey(name),
    driver:lookup_items!transport_plans_driver_id_fkey(name),
    fg_exporter:lookup_items!transport_plans_fg_exporter_id_fkey(name),
    material_exporters:transport_plan_material_exporters(lookup:lookup_items(id,name))`)
  .order('created_at', { ascending: false })
  .range(0, 49)
```

## RPC / Edge Functions
Các RPC dưới đây SECURITY INVOKER (RLS áp dụng, user thường gọi được), chỉ `authenticated` được gọi.

### Edge Function `admin-users` (D-013)
- URL: `https://sybzvaybffgkgiyvevsp.supabase.co/functions/v1/admin-users`. Gọi: `supabase.functions.invoke('admin-users', { body: { action, ... } })` (tự gắn JWT người đăng nhập). POST JSON; CORS mở cho mọi origin.
- Chỉ **admin hoặc root đang hoạt động** gọi được; ngược lại `403 { error: 'Chỉ quản trị viên mới được quản lý người dùng' }`; chưa đăng nhập/phiên hỏng `401`. Mọi lỗi: `{ error: '<tiếng Việt>' }` (400 dữ liệu sai, 403 không đủ quyền, 404 không thấy, 409 hết lượt cấp tên, 500 lỗi hệ thống).
- Quyền (D-014; cài trong `permissions.ts`, test `permissions_test.ts`): **root** quản lý mọi tài khoản trừ việc khóa root; **admin** chỉ quản lý tài khoản `user` và đổi họ tên/mật khẩu của chính mình. Không ai tạo hoặc đặt vai trò `root`. Không còn luật "admin cuối cùng" (root luôn tồn tại và không khóa/hạ được).
- Kiểu `AdminUser = { id: string; username: string; full_name: string; role: 'root'|'admin'|'user'; is_active: boolean; is_pending: boolean; created_by: string | null; created_by_name: string | null; approved_by: string | null; approved_by_name: string | null; approved_at: string | null; created_at: string; email: string | null; last_sign_in_at: string | null }` (`*_by_name` = họ tên ghép phía server từ `profiles`; `create` chỉ trả cột profile, không có `*_name`).

| action | Input | Output | Quy tắc / lỗi |
|---|---|---|---|
| `list` | - | `AdminUser[]` | root: mọi tài khoản; admin: tài khoản `user` + chính mình |
| `preview_username` | `{ full_name }` | `{ username }` (chưa tạo) | 400 "Họ tên không hợp lệ" |
| `create` | `{ full_name, password, role? }` (`role` mặc định `user`) | `AdminUser` (201, có `username`) | mật khẩu 6–72 ký tự ("Mật khẩu phải có ít nhất 6 ký tự"); tạo profile lỗi thì xóa auth user vừa tạo; trùng tên đăng nhập tự thêm số. root tạo `user`/`admin`; admin chỉ `user` (403 "Chỉ root được tạo admin"); `root` → 403 "Không thể tạo tài khoản root" |
| `update` | `{ user_id, full_name?, role? }` | profile đã sửa | `full_name`: root sửa mọi người, admin chỉ user hoặc chính mình. `role`: chỉ root (403 "Chỉ root được đổi vai trò"), chỉ `user`↔`admin`, không áp lên root; 404 |
| `set_active` | `{ user_id, active: boolean }` | profile đã sửa | khóa = `is_active=false` + ban Auth `876000h`; mở = ban `none` + `is_active=true`. root: mọi tài khoản trừ root; admin: chỉ user (403 "Admin chỉ quản lý tài khoản người dùng"); target root → 403 "Không thể khóa hoặc mở khóa tài khoản root"; 404 |
| `reset_password` | `{ user_id, password }` | `{ ok: true }` | mật khẩu 6–72 ký tự. root: mọi tài khoản (kể cả mình); admin: user hoặc chính mình, ngoài ra 403 "Admin chỉ quản lý tài khoản người dùng"; 404 |
| `approve` (D-015) | `{ user_id }` | profile đã sửa | chỉ tài khoản `is_pending` role `user`: gỡ ban Auth (`none`) rồi `is_active=true, is_pending=false, approved_by=người gọi, approved_at=now()`. Admin và root đều được. Khác → 403 "Chỉ duyệt hoặc từ chối được tài khoản đang chờ duyệt"; 404 |
| `reject` (D-015) | `{ user_id }` | `{ ok: true }` | chỉ tài khoản đang chờ: `auth.admin.deleteUser` (profile xóa theo, cascade). Quyền/lỗi như `approve` |

`create` (admin/root tạo tài khoản) ghi `created_by = approved_by = người gọi`, `approved_at = now()`. `set_active` trên tài khoản đang chờ → 403 "Tài khoản đang chờ duyệt: hãy dùng Duyệt hoặc Từ chối".

### Edge Function `register` (D-015, công khai)
- URL: `https://sybzvaybffgkgiyvevsp.supabase.co/functions/v1/register`. **Không cần đăng nhập** (deploy `verify_jwt=false`; khi gọi qua `supabase.functions.invoke` vẫn gửi anon key bình thường). POST JSON; CORS mở. Signup công khai của Supabase Auth vẫn TẮT.
- Input `{ full_name: string; password: string; website?: string }` (`website` = ô honeypot ẩn, phải để trống; có giá trị thì trả 200 giả và không tạo gì). Họ tên ≤ 100 ký tự và phải có ký tự chữ/số; mật khẩu 6–72.
- Output `201 { username, full_name }` (không trả id). Tạo auth user `<username>@kho-an-ha.local` (`email_confirm`, `ban_duration 876000h`) + profile role `user`, `is_active=false`, `is_pending=true`; lỗi tạo profile thì xóa auth user. Tên đăng nhập sinh như `admin-users`. Tài khoản chưa đăng nhập được tới khi admin/root `approve`.
- Lỗi `{ error }`: 400 "Vui lòng nhập họ tên" / "Họ tên tối đa 100 ký tự" / "Mật khẩu phải có ít nhất 6 ký tự" / "Mật khẩu tối đa 72 ký tự" / "Dữ liệu gửi lên không hợp lệ"; 429 "Đang có nhiều yêu cầu chờ duyệt, vui lòng liên hệ quản trị viên" (đang có >= 20 tài khoản chờ duyệt); 409 "Không cấp được tên đăng nhập, vui lòng thử lại"; 500.
- Ví dụ: `supabase.functions.invoke('register', { body: { full_name: 'Lê Thái Bão', password: '******' } })`.

### get_user_names(p_ids uuid[]) (D-016, 000011)
- Mục đích: lấy họ tên người tạo/người sửa (RLS `profiles` không cho user thường đọc hồ sơ người khác). SECURITY DEFINER; chỉ người `is_active_user()` nhận dữ liệu (ngược lại rỗng); `authenticated` gọi được, `anon` không. Chỉ trả id + họ tên + tên đăng nhập; tối đa 500 id (phần dư bị bỏ).
- Input `{ p_ids: string[] }` · Output `{ id: string; full_name: string; username: string }[]` (id không tồn tại thì vắng mặt).
- Ví dụ: `supabase.rpc('get_user_names', { p_ids: [...new Set(rows.flatMap(r => [r.created_by, r.updated_by]).filter(Boolean))] })`.

### list_inspection_details(...) (D-017, 000012)
- Mục đích: đọc một trang danh sách Bảng kiểm nhanh (thay `from('inspection_details_view')...`). Lọc/sắp/phân trang trên bảng `inspection_details` trước, rồi mới join danh mục cho đúng trang; kèm tên người tạo/sửa (không cần gọi `get_user_names`). SECURITY DEFINER từ 000016 (D-021; trước đó invoker) - đầu hàm kiểm `is_active_user()` (đúng điều kiện policy select), nên quyền xem không đổi; `authenticated` gọi được, `anon` không. Không trả tổng số dòng: đếm bằng `count_inspection_details` (bên dưới).
- Input (mọi tham số tùy chọn): `{ p_q?: string; p_from?: string /*yyyy-mm-dd*/; p_to?: string; p_export_type_id?: number; p_product_id?: number; p_construction_id?: number; p_receiving_unit_id?: number; p_sort?: string /*mặc định 'created_at'*/; p_desc?: boolean /*mặc định true*/; p_limit?: number /*mặc định 50, tối đa 200*/; p_offset?: number /*mặc định 0*/ }`
- `p_q`: khớp `tk_number` HOẶC `warehouse_slip_no` bằng `ilike '%q%'` (đã tự escape `%` `_` `\`; rỗng = bỏ lọc). `p_from/p_to` lọc `export_date` (gồm cả hai đầu). Dòng cùng khóa luôn xếp theo `id` cùng chiều; NULL xếp cuối (như FE hiện tại).
- `p_sort` hợp lệ: `created_at`, `export_date`, `tk_number`, `warehouse_slip_no`, `construction_code`, `construction_name`, `export_type_name`, `product_name`, `quantity`, `total_weight_kg`. Giá trị khác -> lỗi.
- Output: `Row[]` = mọi cột của `inspection_details_view` (cùng tên/kiểu/thứ tự) + `created_by_name, created_by_username, updated_by_name, updated_by_username` (`string | null`; null nếu người đó bị xóa hoặc người gọi không phải user đang hoạt động).
- Lỗi: `22023` "Cột sắp xếp không hợp lệ: <giá trị>"; `42501` "Bạn không có quyền xem dữ liệu" khi người gọi không phải user đang hoạt động (kể cả chưa đăng nhập với token hợp lệ nhưng không có profile); `anon` gọi -> `42501` permission denied for function.
- Ví dụ: `supabase.rpc('list_inspection_details', { p_q: 'TK2026/10', p_export_type_id: 3, p_sort: 'export_date', p_desc: true, p_limit: 50, p_offset: 0 })`.
- Ghi chú hiệu năng: sắp theo `created_at`/`export_date` dùng index (không Sort); các cột còn lại sắp trong bộ nhớ trên tập đã lọc (chậm dần theo số dòng sau lọc).

### list_transport_plans(...) (D-017, 000012)
- Mục đích: đọc một trang danh sách Phiếu kế hoạch (thay `from('transport_plans').select(PLAN_SELECT)`); cùng kỹ thuật và quyền như trên.
- Input: `{ p_q?: string; p_from?: string; p_to?: string; p_sort?: string /*mặc định 'created_at'*/; p_desc?: boolean /*mặc định true*/; p_limit?: number /*50, tối đa 200*/; p_offset?: number }`. `p_q` khớp `tk_number` HOẶC `transport_order_no`; ngày lọc `export_date`. `p_sort` hợp lệ: `created_at`, `export_date`, `tk_number`, `transport_order_no`.
- Output: `{ id, tk_number, tk_year, tk_month, tk_seq, export_date, transport_order_no, transport_type_id, transport_type_name, vehicle_id, vehicle_name, driver_id, driver_name, fg_exporter_id, fg_exporter_name, material_exporters: { id: number; name: string; sort_order: number }[] /*đã theo sort_order*/, note, created_by, created_by_name, created_by_username, created_at, updated_by, updated_by_name, updated_by_username, updated_at }[]`. Chú ý: `material_exporters` phẳng `{id,name,sort_order}`, khác dạng lồng `{sort_order, lookup:{id,name}}` của PostgREST embed.
- Lỗi và ví dụ như trên: `supabase.rpc('list_transport_plans', { p_q: 'TK2026', p_limit: 50 })`. Cũng SECURITY DEFINER + kiểm `is_active_user()` từ 000016.

### count_inspection_details(...) (D-021, 000016)
- Mục đích: tổng số dòng Bảng kiểm khớp bộ lọc (thay request `count:'exact'` qua PostgREST). SECURITY DEFINER, `search_path` rỗng, kiểm `is_active_user()`; `authenticated` gọi được, `anon` không. WHERE giống hệt bước lọc của `list_inspection_details` (cùng escape `%` `_` `\`, khớp `tk_number` HOẶC `warehouse_slip_no`) nên tổng và trang khớp nhau.
- Input (mọi tham số tùy chọn): `{ p_q?: string; p_from?: string /*yyyy-mm-dd*/; p_to?: string; p_export_type_id?: number; p_product_id?: number }`. LƯU Ý: không có `p_construction_id`/`p_receiving_unit_id` (hợp đồng chỉ 5 tham số) - nếu gọi `list_inspection_details` với hai bộ lọc đó thì tổng sẽ không khớp; UI hiện không dùng hai bộ lọc này.
- Output: `number` (bigint; PostgREST trả số JSON).
- Lỗi: `42501` "Bạn không có quyền xem dữ liệu". Ví dụ: `supabase.rpc('count_inspection_details', { p_q: 'TK2026/10', p_export_type_id: 3 })`.

### count_transport_plans(...) (D-021, 000016)
- Mục đích: tổng số phiếu khớp bộ lọc. Cùng quyền/kỹ thuật như trên; WHERE giống `list_transport_plans` (`tk_number` HOẶC `transport_order_no`, ngày lọc `export_date`).
- Input: `{ p_q?: string; p_from?: string; p_to?: string }` · Output: `number` · Lỗi: `42501`. Ví dụ: `supabase.rpc('count_transport_plans', { p_q: 'TK2026' })`.

**Quy tắc tên đăng nhập:** bỏ dấu (NFD, đ→d), chữ thường, chỉ `[a-z0-9]`; = chữ cuối + `.` + chữ cái đầu các từ trước ("Lê Thái Bão" → `bao.lt`; "Bão" → `bao`); trùng (không phân biệt hoa thường) → `bao.lt2`, `bao.lt3`... Email nội bộ = `<username>@kho-an-ha.local` (`email_confirm: true`, không gửi mail). Hằng số domain `INTERNAL_EMAIL_DOMAIN` ở `supabase/functions/admin-users/username.ts`; FE tự gắn domain này khi người dùng gõ tên đăng nhập không có `@`. Tài khoản cũ đăng nhập bằng email thật như trước.

### request_plan_edit(p_plan_id, p_reason) (D-019, 000014)
- Mục đích: người tạo phiếu đã quá 24 giờ gửi yêu cầu được sửa. `security definer`, chỉ `authenticated` và `is_active_user()`. Kiểm: lý do (sau trim) 1..500 ký tự; phiếu tồn tại và `created_by = auth.uid()`; phiếu đã quá 24 giờ; chưa có yêu cầu approved còn hạn; chưa có yêu cầu pending của mình cho phiếu đó.
- Input: `{ p_plan_id: number, p_reason: string }` · Output: `number` (id yêu cầu)
- Lỗi: `42501` "Bạn không có quyền gửi yêu cầu sửa"; `22023` "Vui lòng nhập lý do yêu cầu sửa" / "Lý do tối đa 500 ký tự"; `P0002` "Không tìm thấy phiếu hoặc bạn không phải người tạo phiếu"; `P0001` "Phiếu còn trong 24 giờ, sửa trực tiếp" / "Phiếu đang được mở khóa sửa, không cần gửi yêu cầu" / "Đã có yêu cầu đang chờ duyệt"
- Gọi: `const { data: id, error } = await supabase.rpc('request_plan_edit', { p_plan_id: 123, p_reason: 'Nhập nhầm số xe' })`

### request_detail_edit(p_detail_id, p_reason) (D-020, 000015)
- Mục đích: người tạo dòng bảng kiểm đã quá 24 giờ gửi yêu cầu được sửa dòng đó (kể cả dòng không gắn phiếu). `security definer`, chỉ `authenticated` và `is_active_user()`. Kiểm: lý do (sau trim) 1..500 ký tự; dòng tồn tại và `created_by = auth.uid()`; dòng đã quá 24 giờ; chưa có yêu cầu approved còn hạn của mình cho dòng đó **hoặc cho phiếu của dòng**; chưa có yêu cầu pending của mình cho dòng đó.
- Input: `{ p_detail_id: number, p_reason: string }` · Output: `number` (id yêu cầu)
- Lỗi: `42501` "Bạn không có quyền gửi yêu cầu sửa"; `22023` "Vui lòng nhập lý do yêu cầu sửa" / "Lý do tối đa 500 ký tự"; `P0002` "Không tìm thấy dòng hoặc bạn không phải người tạo dòng"; `P0001` "Dòng còn trong 24 giờ, sửa trực tiếp" / "Dòng đang được mở khóa sửa, không cần gửi yêu cầu" / "Đã có yêu cầu đang chờ duyệt"
- Gọi: `const { data: id, error } = await supabase.rpc('request_detail_edit', { p_detail_id: 456, p_reason: 'Nhập nhầm khối lượng' })`

### Realtime `edit_requests` (D-020, 000015)
- Bảng `public.edit_requests` nằm trong publication `supabase_realtime`. RLS select (của mình hoặc admin/root) tự áp cho Realtime: user chỉ nhận sự kiện về yêu cầu của mình, admin/root nhận tất cả. Không đặt `replica identity full`: payload `new` của INSERT/UPDATE luôn đủ cột (`status, decision_note, unlock_until, plan_id, detail_id, ...`); payload `old` chỉ có `id` (FE không nên dựa vào `old`). Bộ lọc `requested_by=eq.<uid>` chạy trên bản ghi mới nên dùng được cho UPDATE.
- Người yêu cầu (nhận kết quả duyệt/từ chối):
  `supabase.channel('my-edit-requests').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'edit_requests', filter: 'requested_by=eq.<uid>' }, (payload) => { /* payload.new.status === 'approved' | 'rejected' */ }).subscribe()`
- Admin/root (yêu cầu mới + thay đổi): `supabase.channel('all-edit-requests').on('postgres_changes', { event: '*', schema: 'public', table: 'edit_requests' }, cb).subscribe()` (không filter).
- Chỉ có sự kiện khi đang kết nối; người offline lấy trạng thái bằng truy vấn khi mở trang.
- Danh sách có embed (đã kiểm tên cột thật): `supabase.from('edit_requests').select('*, plan:transport_plans(tk_number, export_date), detail:inspection_details(tk_number, warehouse_slip_no, export_date, work_item, product:lookup_items!inspection_details_product_id_fkey(name)), requester:profiles!edit_requests_requested_by_fkey(full_name)').order('created_at', { ascending: false }).range(0, 49)`. Yêu cầu phiếu: `plan` có giá trị, `detail` null; yêu cầu dòng ngược lại. `inspection_details` không có cột tên mặt hàng hay `item_id`: mặt hàng là `product_id` -> `lookup_items.name` (hạng mục là `work_item`, text). Dòng không gắn phiếu có `tk_number` null.
- Trạng thái yêu cầu của một dòng: `.from('edit_requests').select('*').eq('detail_id', id).order('created_at', { ascending: false }).limit(1)`.

### decide_edit_request(p_id, p_approve, p_note?) (D-019, 000014)
- Mục đích: admin/root duyệt hoặc từ chối yêu cầu đang chờ. Ghi `status`, `decided_by = auth.uid()`, `decided_at = now()`, `decision_note` (trim, rỗng = null); duyệt thì `unlock_until = now() + 24 giờ`. `security definer`, chỉ `authenticated` và `is_admin()` (root gồm trong đó).
- Input: `{ p_id: number, p_approve: boolean, p_note?: string | null }` · Output: `void`
- Lỗi: `42501` "Chỉ admin được duyệt yêu cầu sửa"; `22023` "Thiếu quyết định duyệt hay từ chối"; `P0002` "Không tìm thấy yêu cầu sửa"; `P0001` "Yêu cầu này đã được xử lý"
- Từ 000015 dùng chung cho cả yêu cầu phiếu và yêu cầu dòng (chữ ký không đổi).
- Gọi: `await supabase.rpc('decide_edit_request', { p_id: 7, p_approve: true, p_note: 'Đồng ý' })`
- Đọc danh sách chờ duyệt (admin): `supabase.from('edit_requests').select('*, plan:transport_plans(tk_number), requester:profiles!edit_requests_requested_by_fkey(full_name)').eq('status','pending').order('created_at',{ascending:false}).range(0,49)`. Lưu ý: admin (không phải root) chỉ đọc được hồ sơ `role='user'` nên embed `profiles` của người duyệt là admin/root có thể trả null; dùng `get_user_names` để lấy tên. User thường: `.from('edit_requests').select('*').eq('plan_id', id).order('created_at',{ascending:false}).limit(1)` để biết trạng thái yêu cầu của mình.

### reserve_tk_number()
- Mục đích (D-018): giữ cho người gọi 1 số phiếu TK của tháng hiện tại (giờ Asia/Ho_Chi_Minh) trong 5 phút. `security definer`, chỉ `authenticated` và `is_active_user()`. Trong khóa advisory: xóa chỗ giữ quá hạn; nếu người gọi đang giữ số còn hạn cùng tháng và số chưa bị phiếu nào dùng -> gia hạn thêm 5 phút, trả đúng số đó; ngược lại bỏ chỗ giữ cũ, lấy số nhỏ nhất không trùng phiếu và không trùng chỗ đang giữ của người khác, giữ 5 phút.
- Input: không · Output: `string` vd `'TK2026/10-005'`
- Lỗi: `42501` "Bạn không có quyền giữ số phiếu thống kê"; `P0001` "Đã hết số phiếu thống kê trong tháng m/yyyy"
- Gọi: `supabase.rpc('reserve_tk_number')` khi mở form "Thêm phiếu" (gọi lại khi còn hạn chỉ gia hạn, không đổi số; nên gọi lại định kỳ < 5 phút nếu form còn mở).

### release_tk_reservation()
- Mục đích: trả số đang giữ của người gọi (hủy/đóng form). Không lỗi nếu không có chỗ giữ. `security definer`, chỉ `authenticated`.
- Input: không · Output: `void`
- Gọi: `supabase.rpc('release_tk_reservation')`

### next_tk_number()
- Mục đích: xem trước số phiếu sẽ cấp (không giữ chỗ; lúc lưu có thể khác nếu người khác lưu trước). Từ 000013 bỏ qua các số đang bị người khác giữ. Muốn số cố định cho form dùng `reserve_tk_number`.
- Input: không
- Output: `string` vd `'TK2026/10-005'`
- Lỗi: `P0001` "Đã hết số phiếu thống kê trong tháng m/yyyy"
- Gọi: `supabase.rpc('next_tk_number')`

### create_transport_plan(...)
- Mục đích: tạo phiếu, sinh số trong transaction (khóa advisory), lấp số khuyết nhỏ nhất của tháng hiện tại (giờ Asia/Ho_Chi_Minh, theo ngày tạo).
- Input: `{ p_export_date: string | null, p_transport_order_no: string | null, p_transport_type_id: number | null, p_vehicle_id: number | null, p_driver_id: number | null, p_fg_exporter_id: number | null, p_material_exporter_ids: number[], p_note: string | null }` (chuỗi rỗng ở text được đổi thành null; id trùng/null trong mảng bị bỏ, giữ lần xuất hiện đầu; `sort_order` của NV xuất VT = thứ tự trong mảng sau khi lọc, bắt đầu từ 0)
- Output: một dòng `transport_plans` (có `tk_number`). Từ 000013 (D-018): nếu người gọi đang giữ số còn hạn của tháng hiện tại và số chưa bị dùng -> dùng đúng số đó; hết hạn/không có -> cấp số mới (né chỗ người khác giữ), nên **FE so sánh `tk_number` trả về với số đã giữ và báo "số phiếu đã đổi thành ..."** nếu khác. Lưu xong xóa chỗ giữ của người gọi.
- Lỗi: `P0001` hết số tháng; `23503` id danh mục không tồn tại
- Gọi: `supabase.rpc('create_transport_plan', { p_export_date: '2026-10-29', p_transport_order_no: null, p_transport_type_id: tid, p_vehicle_id: vid, p_driver_id: did, p_fg_exporter_id: null, p_material_exporter_ids: [a, b], p_note: null })`
- Lưu ý: `src/types/database.ts` khai tham số tùy chọn là `number | null` / `string | null`, mảng `number[]`; không cần ép kiểu.

### update_transport_plan(...)
- Mục đích: sửa phiếu, thay toàn bộ danh sách NV xuất VT. Không đổi số phiếu.
- Input: như create, thêm `p_id: number` đầu tiên
- Output: một dòng `transport_plans` (đã cập nhật)
- Lỗi: `P0002` "Không tìm thấy phiếu cần sửa"; `23503` id danh mục không tồn tại
- Gọi: `supabase.rpc('update_transport_plan', { p_id: id, ...fields })`

### inspection_weight_total(p_from, p_to)
- Mục đích: tổng `total_weight_kg` của `inspection_details` có `export_date` trong khoảng nửa mở `[p_from, p_to)` (cho thẻ "tháng này"). Từ 000007 đọc từ `inspection_daily_stats` (chữ ký và kết quả không đổi). `security invoker`: RLS áp theo người gọi; chỉ `authenticated`.
- Input: `{ p_from: string, p_to: string }` (yyyy-mm-dd; `p_to` là ngày đầu tháng sau)
- Output: `number` (kg; 0 nếu không có dòng)
- Gọi: `supabase.rpc('inspection_weight_total', { p_from: '2026-10-01', p_to: '2026-11-01' })`

### inspection_stats(p_from, p_to, p_group)
- Mục đích: thống kê từ bảng tổng hợp, phục vụ báo cáo và đối chiếu sheet Chart. Khoảng nửa mở `[p_from, p_to)`; `null` = không giới hạn phía đó (dòng không có ngày chỉ vào khi cả hai null). `security invoker`, chỉ `authenticated`.
- Input: `{ p_from: string | null, p_to: string | null, p_group: 'export_type' | 'product' | 'month' }`
- Output: `{ key_id: number | null, key_name: string | null, row_count: number, quantity_sum: number, weight_kg_sum: number }[]`. `export_type`/`product`: `key_id` = id danh mục, `key_name` = tên, sắp theo tên (nhóm chưa chọn: null, xếp cuối). `month`: `key_id` = yyyymm (vd `202610`), `key_name` = `'2026-10'`, sắp tăng dần.
- Lỗi: `22023` "Nhóm thống kê không hợp lệ: ..."
- Gọi: `supabase.rpc('inspection_stats', { p_from: '2026-01-01', p_to: '2027-01-01', p_group: 'export_type' })`

### search_plan_numbers(p_q, p_limit)
- Mục đích: combobox số TK, tìm phía server. Rỗng: phiếu mới nhất. Từ khóa >= 3 ký tự: chứa chuỗi (không phân biệt hoa thường; `%` `_` được coi là ký tự thường), khớp đầu chuỗi xếp trước rồi mới nhất. Từ khóa 1-2 ký tự: chỉ khớp đầu chuỗi.
- Input: `{ p_q: string, p_limit?: number }` (mặc định 20, tối đa 50, tối thiểu 1)
- Output: `{ id: number, tk_number: string, export_date: string | null }[]`
- Gọi: `supabase.rpc('search_plan_numbers', { p_q: '2026/10', p_limit: 20 })`

### search_lookup_items(p_kind, p_q, p_limit)
- Mục đích: combobox danh mục lớn (công trình, đơn vị nhận, xe, tài xế...). Rỗng: các mục đầu theo tên. Có chữ: `name` hoặc `code` chứa chuỗi (không phân biệt hoa thường **và dấu tiếng Việt** từ 000008: "dang" ra "Đặng", "nguyen van" ra "Nguyễn Văn"; so khớp qua `f_search_norm`), khớp đầu xếp trước rồi theo tên.
- Input: `{ p_kind: string, p_q: string, p_limit?: number }` (mặc định 20, tối đa 50). `p_kind` sai -> mảng rỗng.
- Output: các dòng `lookup_items` (`id, kind, name, code, created_at, updated_at`)
- Gọi: `supabase.rpc('search_lookup_items', { p_kind: 'construction', p_q: 'HN-01' })`

### get_lookup_items(p_ids)
- Mục đích: lấy tên các id đang chọn (khi mở form sửa) mà không tải cả danh mục. Tối đa 1000 mục, sắp theo id.
- Input: `{ p_ids: number[] }` · Output: các dòng `lookup_items`
- Gọi: `supabase.rpc('get_lookup_items', { p_ids: [12, 345] })`

### Hàm nội bộ (cũng grant authenticated): `tk_format(year, month, seq)` → text; `tk_next_seq(year, month)` → int|null (từ 000013 là `security definer`: bỏ qua số đang bị người KHÁC giữ còn hạn, vẫn coi số của chính người gọi là trống). Không cần gọi từ FE.
Hàm của trigger/bảo trì (`inspection_stats_apply`, `inspection_stats_on_truncate`, `rebuild_inspection_daily_stats`) là security definer, **không** ai ngoài postgres gọi được.

Quy tắc cho FE khi dữ liệu lớn (đếm `estimated`, tìm phía server, lọc theo id, sắp kèm `id`): xem `docs/performance.md`.

## Nạp CSV (id tự tăng)
- `lookup_items` và `transport_plans` có `id bigint generated by default as identity`: CSV có thể bỏ cột `id` (DB tự đánh số) hoặc tự ghi `id`.
- `lookup_items` cần: `kind`, `name` (đã trim, unique `(kind, lower(name))`); tùy chọn `id`, `created_at`.
- `transport_plans` cần: `tk_number`, `tk_year`, `tk_month`, `tk_seq` (+ tùy chọn `export_date`, `transport_order_no`, `transport_type_id`, `vehicle_id`, `driver_id`, `fg_exporter_id` là id số của `lookup_items`, `note`, `id`). Nạp `lookup_items` trước.
- `transport_plan_material_exporters` cần: `plan_id`, `lookup_id` (id số). Nạp sau hai bảng trên.
- Nếu CSV tự ghi `id`, **sau khi nạp phải chạy** (nếu không, lần thêm sau sẽ trùng khóa):
```sql
select setval(pg_get_serial_sequence('public.lookup_items','id'), (select max(id) from public.lookup_items));
select setval(pg_get_serial_sequence('public.transport_plans','id'), (select max(id) from public.transport_plans));
```

### Nạp CSV cho `inspection_details`
- Cột cần: `plan_id` (id số của `transport_plans`, bắt buộc - nạp phiếu theo số TK trước), tùy chọn `export_date` (yyyy-mm-dd), `warehouse_slip_no`, `construction_id`, `delivery_unit_id`, `receiving_unit_id`, `export_type_id`, `product_id`, `unit_id`, `carrier_id`, `work_item`, `quantity`, `total_weight_kg` (số chấm thập phân, kg, >= 0), `note`, `id`, `created_at`.
- Map tên -> id: nạp các danh mục mới vào `lookup_items` trước (`kind` = `construction`/`delivery_unit`/`receiving_unit`/`export_type`/`product`/`unit`/`carrier`; công trình thêm `code` = Mã CT), rồi tra `id` theo `(kind, lower(name))` (công trình: `(kind, lower(code))`). Tên chưa có thì phải tạo trước, nếu không FK báo `23503`. `Chọn` coi như trống.
- Nếu CSV tự ghi `id`, sau khi nạp chạy:
```sql
select setval(pg_get_serial_sequence('public.inspection_details','id'), (select max(id) from public.inspection_details));
```
- Nạp `lookup_items` mới có `id` tự ghi thì cũng setval như mục trên.

### Nạp dữ liệu cũ (D-011) - bảng tạm
- `import_plans` (14 cột text: `tk_number, tk_year, tk_month, tk_seq, export_date, transport_order_no, transport_type, vehicle, driver, fg_exporter, material_exporter, note, is_stub, source_row`) và `import_details` (17 cột text: `import_ref, tk_number, export_date, warehouse_slip_no, construction_code, work_item, delivery_unit, receiving_unit, export_type, product, unit, quantity, total_weight_kg, shipper, carrier, note, source_row`). RLS bật, không policy, anon/authenticated không có quyền: chỉ Dashboard/postgres. Không nằm trong `src/types/database.ts`. Xóa sau khi nạp: `drop table public.import_plans, public.import_details;` (cần người dùng xác nhận).
- Định dạng giả định cho CSV: ngày `yyyy-mm-dd`; số dùng `.` thập phân, không dấu nghìn, không âm; `tk_year/tk_month/tk_seq` là số nguyên; bỏ trống = rỗng.
- Các bước SQL nạp: `supabase/import/apply_legacy_import.sql` (không phải migration; chạy từng câu theo số bước).

## Mã lỗi thường gặp (PostgREST)
- `23505`: trùng tên (hoặc trùng mã `code`) danh mục cùng loại (không phân biệt hoa thường) -> "Tên này đã có trong danh mục".
- `23503`: xóa danh mục đang được phiếu dùng (restrict) -> "Danh mục đang được dùng, không xóa được".
- `23514`: tên rỗng/có khoảng trắng đầu cuối (FE nên trim trước).
- `P0001`: hết số phiếu trong tháng, hoặc cố đổi số phiếu.

## Giả định
- Năm/tháng của số phiếu theo ngày tạo, không theo `export_date` (D-004).
- Xóa phiếu giải phóng số; số đó sẽ được cấp lại cho phiếu mới (do lấp số khuyết).

## Changelog
- 2026-10-30 T-058 (D-021): migration `20261030000017_search_definer.sql` - `search_plan_numbers`, `search_lookup_items` (giữ chữ ký, kiểu trả về, thân truy vấn, SET) đổi sang `security definer`, `search_path = ''`, thêm `(select public.is_active_user())` vào WHERE mỗi nhánh (để `ilike`/`like` dùng được index trigram, không bị RLS chặn). Quyền xem không đổi (policy select của `transport_plans`, `lookup_items` chỉ yêu cầu `is_active_user()`). Khác với `list_*`/`count_*` (000016, raise `42501`): hai hàm này vẫn là `language sql` và **trả 0 dòng, không raise** khi chưa đăng nhập/tài khoản không hoạt động (giữ hành vi cũ dưới RLS). `get_lookup_items` không đổi (tra theo id, không ilike; vẫn invoker). Không breaking, không đổi `database.ts`. Số đo kỳ vọng: xem cuối file migration.
- 2026-10-30 T-056 (D-021): migration `20261030000016_fast_search_definer.sql` - `list_inspection_details`, `list_transport_plans` (giữ chữ ký, kiểu trả về, thân hàm, các SET) đổi sang `security definer` + đầu hàm `if not is_active_user() then raise 42501 'Bạn không có quyền xem dữ liệu'` (để `ilike` dùng được index trigram, không bị RLS chặn); RPC mới `count_inspection_details(p_q, p_from, p_to, p_export_type_id, p_product_id)` và `count_transport_plans(p_q, p_from, p_to)` trả `bigint`, cùng bộ lọc với list_*. Không breaking (quyền xem không đổi: các policy select đều chỉ yêu cầu `is_active_user()`). Việc cần làm sau khi áp: `VACUUM ANALYZE public.inspection_details, public.transport_plans` sau mỗi lần nạp/nhân dữ liệu lớn. Giả định: `count_inspection_details` không có bộ lọc công trình/đơn vị nhận (đúng hợp đồng chốt).
- 2026-10-30 T-049 (D-020): migration `20261030000015_edit_requests_details_realtime.sql` - `edit_requests.plan_id` bỏ not null, thêm `detail_id` (FK `edit_requests_detail_id_fkey` -> `inspection_details`, cascade) + check `edit_requests_target_check` (đúng một trong hai) + unique partial `edit_requests_pending_detail_uq` + index `edit_requests_detail_idx`; `can_update_row` đổi chữ ký thành 4 tham số (`p_detail_id bigint default null`), bản 3 tham số bị xóa (cùng migration: drop policy -> drop hàm -> tạo hàm mới -> tạo lại `can_edit_plan` và policy UPDATE `transport_plans`, `inspection_details`); policy UPDATE `inspection_details` = `can_update_row(created_by, created_at, plan_id, id)`; RPC mới `request_detail_edit(p_detail_id, p_reason)`; `decide_edit_request` không đổi; `edit_requests` thêm vào publication `supabase_realtime`. Không breaking (FE cũ vẫn chạy; kiểu `edit_requests.Row.plan_id` thành `number | null` và có thêm `detail_id`). Giả định: yêu cầu pending của phiếu không chặn yêu cầu pending của dòng thuộc phiếu đó (hai yêu cầu độc lập); duyệt yêu cầu phiếu làm `request_detail_edit` từ chối "đang được mở khóa" cho các dòng của phiếu đó; không đặt replica identity full.
- 2026-10-30 T-047 (D-019): migration `20261030000014_edit_requests.sql` - bảng `edit_requests` (RLS: select của mình/admin, không policy ghi); hàm `can_update_row(uuid, timestamptz, bigint)`; policy UPDATE của `transport_plans` và `inspection_details` đổi sang `can_update_row` (DELETE giữ `can_edit_row`); `can_edit_plan` (giữ chữ ký) dùng `can_update_row`; RPC mới `request_plan_edit`, `decide_edit_request` (security definer); `update_transport_plan` (giữ chữ ký, vẫn security invoker, tự theo policy) chỉ đổi nội dung thông báo `P0002`. Không breaking. Giả định: admin tự gửi yêu cầu cho phiếu của mình vẫn được (vô hại); yêu cầu approved hết hạn giữ nguyên làm lịch sử, người tạo có thể gửi yêu cầu mới; `unlock_until` tính từ lúc duyệt, không gia hạn.
- 2026-10-30 T-045 (D-018): migration `20261030000013_tk_reservations.sql` - bảng `tk_reservations` (RLS: select/delete dòng của mình, không policy ghi); RPC mới `reserve_tk_number()`, `release_tk_reservation()` (security definer, grant authenticated); `tk_next_seq` (giữ chữ ký) đổi sang security definer và né chỗ giữ còn hạn của người khác (kéo theo `next_tk_number`); `create_transport_plan` (giữ chữ ký, vẫn security invoker) dùng chỗ giữ của người gọi nếu còn hạn và xóa nó sau khi lưu. Không breaking. Giả định: hạn giữ 5 phút; số khuyết vẫn được lấp, số đang bị giữ không được cấp cho người khác; không có job dọn (dọn khi gọi `reserve_tk_number`).
- 2026-10-30 T-041 (D-017): migration `20261030000012_fast_lists.sql` - RPC mới `list_inspection_details` và `list_transport_plans` (security invoker, `set join_collapse_limit = 1`, `plan_cache_mode = force_custom_plan`; lọc-trước-rồi-join; trả kèm tên người tạo/sửa); index `inspection_details_export_date_nl_id_idx`, `transport_plans_export_date_nl_id_idx` (`export_date desc nulls last, id desc`) cho sắp giảm dần NULL cuối. Không breaking (chỉ thêm). Cần đo `explain` sau khi áp (ngưỡng ở cuối file migration và `docs/performance.md`).
- 2026-10-30 T-039 (D-015, D-016): migration `20261030000011_registration.sql` - `profiles` thêm `is_pending` (+check `profiles_pending_inactive_chk`, index partial `profiles_pending_idx`), `created_by`, `approved_by`, `approved_at` (FK `auth.users` on delete set null; backfill `approved_at = created_at` cho tài khoản hiện có); `transport_plans.updated_by`, `inspection_details.updated_by`; `guard_owner_fields()` đặt `updated_by` (xem mục Chống giả mạo); `inspection_details_view` thêm `updated_by` ở cuối; RPC `get_user_names`. Edge Function MỚI `register` (công khai, verify_jwt=false; 400/409/429/500); `admin-users`: `list` trả thêm `is_pending, created_by, created_by_name, approved_by, approved_by_name, approved_at`, action mới `approve`/`reject`, `set_active` không áp cho tài khoản chờ duyệt, `create` ghi created_by/approved_by. Cần deploy `register` (mới) và `admin-users` (v4) sau khi chạy migration. Không breaking (chỉ thêm).
- 2026-10-30 T-036 (D-014): migration `20261030000010_root_role.sql` - `profiles.role` thêm `'root'` (check `profiles_role_check`; unique partial index `profiles_single_root_uq` = tối đa 1 root); `thaibao06061997@gmail.com` = root; `is_admin()` (giữ chữ ký) nay true cho `admin` và `root` nên mọi policy dữ liệu tự áp cho root; thêm `is_root()`; policy `profiles_select` = chính mình, hoặc root (tất cả), hoặc admin (chỉ role `user`). Edge Function `admin-users`: admin/root gọi được; quyền theo `permissions.ts` (xem mục Edge Function); bỏ luật "admin cuối cùng"; sửa tài liệu mật khẩu 6–72 (đã đúng trong code từ v2). **Cho FE**: `role` có thêm `'root'`; `list` của admin chỉ trả user + chính mình; ẩn nút theo quyền (lỗi 403 vẫn là chốt chặn thật). Cần deploy lại function sau khi chạy migration.
- 2026-10-30 T-034 (D-013): migration `20261030000009_profiles_roles.sql` - bảng `profiles` (RLS: đọc chính mình/admin, không ghi từ FE), hàm `is_admin()`, `is_active_user()`; backfill profile cho mọi `auth.users` (`thaibao06061997@gmail.com` = admin, còn lại = user); **đổi RLS** `lookup_items` (update/delete admin), `transport_plans`/`inspection_details` (delete admin), `transport_plan_material_exporters` (delete cho user - ngoại lệ vì `update_transport_plan`), `inspection_daily_stats`; mọi policy yêu cầu `is_active_user()` thay cho "đã đăng nhập". Edge Function `admin-users` (xem mục trên). Bổ sung cùng migration: hàm `can_edit_row`, `can_edit_plan`; sửa/xóa `transport_plans`, `inspection_details` (và ghi `transport_plan_material_exporters`) chỉ cho người tạo trong 24 giờ hoặc admin; trigger `*_guard_owner_ins/upd` chống giả mạo `created_by`/`created_at`; `inspection_details_view` thêm cột cuối `created_by`; `update_transport_plan` đổi thông báo `P0002`. Dữ liệu đã nạp có `created_by` null → chỉ admin sửa/xóa cho đến khi chạy `supabase/import/assign_owner_bao_lt.sql`. **Breaking cho FE**: user thường chỉ sửa/xóa dữ liệu của mình trong 24 giờ và không sửa/xóa danh mục; bị chặn thì PostgREST trả 0 dòng, không lỗi — kiểm số dòng; ẩn các nút đó theo vai trò/`created_by`. Khuyến nghị: tắt "Allow new users to sign up" trong Auth settings (tài khoản tạo qua `admin-users`) — nếu không, người lạ tự đăng ký vẫn bị RLS chặn vì không có profile.
- 2026-10-29 T-001: thêm `lookup_items`, `transport_plans`, `transport_plan_material_exporters`, RPC `next_tk_number`, `create_transport_plan`, `update_transport_plan`, RLS v1.
- 2026-10-29 T-008 (D-007): migration `20261029000002_bigint_ids.sql` - `id` của `lookup_items`/`transport_plans` và các khóa ngoại (`*_id`, `plan_id`, `lookup_id`) từ `uuid` sang `bigint` (identity `by default`); id cũ đánh số lại theo `created_at, kind, name` / `created_at`. Tên constraint FK giữ nguyên. RPC `create_transport_plan`/`update_transport_plan` đổi tham số id sang `bigint`/`bigint[]` (chữ ký cũ uuid bị xóa). `created_by` vẫn `uuid`. Thêm mục Nạp CSV. **Breaking**: FE phải dùng `number` cho id.
- 2026-10-29 T-009 (D-008): migration `20261029000003_inspection_details.sql` - `lookup_items.code` + 7 `kind` mới + unique `(kind, lower(code))` + seed `delivery_unit` "An Hạ"; `transport_plan_material_exporters.sort_order`, RPC `create_transport_plan`/`update_transport_plan` (chữ ký không đổi) ghi `sort_order` theo thứ tự mảng; bảng `inspection_details` (RLS, 4 policy) và view `inspection_details_view` (security_invoker). Không breaking. Giả định: Số lệnh VC/xe/tài xế/NV xuất hàng không lưu trên dòng, đọc từ phiếu qua view; TODO: danh mục `export_type` (mã 1-11) chưa nạp.
- 2026-10-29 T-018 (D-009, D-010): migration `20261029000004_inspection_shipper.sql` - ghi lại unique index `lookup_items_kind_name_uq` = `(kind, lower(name)) where kind <> 'construction'` (đã sửa tay trên DB thật, D-009); `inspection_details.shipper_id` (FK `inspection_details_shipper_id_fkey` -> `lookup_items`, on delete restrict, index; kind `fg_exporter`/`material_exporter` kiểm ở FE); `inspection_details_view` thêm cột cuối `shipper_id`, `plan_shipper_name`, `shipper_name` đổi thành `coalesce(người được chọn, NV xuất TP/BTP, NV xuất VT đầu tiên)`. Không breaking (chỉ thêm cột, thứ tự cột cũ giữ nguyên).
- 2026-10-29 T-021 (D-011): migration `20261029000005_legacy_import.sql` - `inspection_details.plan_id` cho phép null; `inspection_details_view` đổi `join` -> `left join transport_plans` (cột/thứ tự giữ nguyên, các cột lấy từ phiếu có thể null); `transport_plans_tk_seq_check` nới thành `1..9999`; thêm `inspection_details.import_ref` + unique index `inspection_details_import_ref_uq` (where not null); bảng tạm `import_plans`, `import_details` (RLS, không policy). **Ảnh hưởng FE**: kiểu `Row.plan_id` thành `number | null` (và `Insert.plan_id` tùy chọn) - FE phải xử lý dòng không có phiếu và vẫn bắt buộc chọn số TK khi nhập mới. Script nạp: `supabase/import/apply_legacy_import.sql`.
- 2026-10-29 T-023: migration `20261029000006_perf_stats.sql` - extension `pg_trgm` (schema `extensions`); GIN trigram index trên `transport_plans(tk_number, transport_order_no)`, `inspection_details(warehouse_slip_no)`, `lookup_items(code, name)` cho `ilike '%x%'`; btree `transport_plans(export_date)`; RPC `inspection_weight_total(p_from, p_to)`. Không breaking. Lưu ý: index trigram chỉ có tác dụng khi từ khóa >= 3 ký tự.
- 2026-10-29 T-028 (D-012): migration `20261029000007_scale.sql` - RPC `search_plan_numbers`, `search_lookup_items`, `get_lookup_items`, `inspection_stats`; bảng `inspection_daily_stats` (RLS chỉ select) + 4 trigger trên `inspection_details` (statement-level: insert/update/delete cộng-trừ delta, truncate xóa) + `rebuild_inspection_daily_stats()` (backfill đã chạy trong migration); `inspection_weight_total` đọc từ bảng tổng hợp (chữ ký/kết quả không đổi); index mới `transport_plans(created_at desc, id desc)`, `transport_plans(export_date desc, id desc)`, `inspection_details(created_at desc, id desc)`, `inspection_details(export_date desc, id desc)`, `lookup_items(kind, name, id)`. Không breaking. Tài liệu hiệu năng và kịch bản đo: `docs/performance.md`, `supabase/tests/perf/seed_synthetic.sql`. Sửa BUG-009: danh sách migration ở đầu file, ngoại lệ unique tên của `construction`, cột `shipper_id`, tên FK `tpme_*` và `inspection_details_shipper_id_fkey`. Giả định: PostgreSQL >= 15 (`unique nulls not distinct`).
- 2026-10-29 T-031 (D-012): migration `20261029000008_inspection_tk_search.sql` - (1) cột `inspection_details.tk_number` (text, **chỉ đọc**, trigger `inspection_details_fill_tk` điền từ `transport_plans` khi insert / đổi `plan_id`; FE KHÔNG ghi; đã backfill) + GIN trigram `inspection_details_tk_number_trgm_idx`; `inspection_details_view.tk_number` nay là `d.tk_number` (tên, kiểu, vị trí cột không đổi) để `.or(tk_number.ilike, warehouse_slip_no.ilike)` chạy BitmapOr trên một bảng thay vì Seq Scan hai bảng (đo 160 ms ở 41.800 dòng). (2) extension `unaccent`, hàm `public.f_search_norm(text)` (immutable: bỏ dấu, thường, đ->d), GIN trigram `lookup_items_name_norm_trgm_idx`, `lookup_items_code_norm_trgm_idx`; `search_lookup_items` (chữ ký/kiểu trả về giữ nguyên) so khớp không dấu. Không breaking; `search_plan_numbers` không đổi (số TK không dấu). Lưu ý FE: tìm theo `tk_number` của view chỉ đúng khi dòng có phiếu (như trước).
