"""Sao lưu hằng ngày: Nhập phiếu + Bảng kiểm -> một file Excel (2 sheet) trên ổ mạng.

Chạy tay:  python sao-luu/sao_luu.py
Cấu hình:  .env.local ở thư mục gốc (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)
           sao-luu/.env (BACKUP_USERNAME, BACKUP_PASSWORD, BACKUP_DIR tùy chọn)
Chỉ ĐỌC dữ liệu bằng một tài khoản thường (qua RLS); không ghi gì lên Supabase.
"""
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests
from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
LOG = HERE / "sao-luu.log"
VN = timezone(timedelta(hours=7))  # Việt Nam không có giờ mùa hè
DEFAULT_DIR = r"Z:\PHONG KHO\NHOM XUAT HANG\sao-luu-du-lieu-thong-ke"
INTERNAL_EMAIL_DOMAIN = "kho-an-ha.local"  # giống src/lib/auth.ts
D, N = "dd/mm/yyyy", "#,##0.##"

# (tiêu đề, độ rộng, định dạng ô)
PLAN_COLS = [
    ("Số phiếu TK", 18, None), ("Ngày xuất", 12, D), ("Số lệnh VC", 18, None), ("Phân loại VC", 22, None), ("Số xe", 14, None),
    ("Tài xế", 22, None), ("NV xuất TP/BTP", 22, None), ("NV xuất VT", 30, None), ("Ghi chú", 30, None),
    ("Người tạo", 20, None), ("Ngày tạo", 17, None), ("Người sửa", 20, None), ("Ngày sửa", 17, None),
]
DETAIL_COLS = [
    ("Số phiếu TK", 18, None), ("Số lệnh VC", 18, None), ("Ngày xuất", 12, D), ("Số PXK", 16, None), ("Mã CT", 14, None),
    ("Tên công trình", 34, None), ("Hạng mục", 24, None), ("Đơn vị giao hàng", 26, None), ("Đơn vị nhận hàng", 26, None),
    ("Loại hình xuất", 24, None), ("Mặt hàng", 30, None), ("ĐVT", 8, None), ("Số lượng", 12, N), ("Tổng khối lượng (kg)", 16, N),
    ("NV xuất hàng", 22, None), ("Số xe", 14, None), ("Tài xế", 22, None), ("Nhà xe", 18, None), ("Ghi chú", 30, None),
    ("Người tạo", 20, None), ("Ngày tạo", 17, None), ("Người sửa", 20, None), ("Ngày sửa", 17, None),
]


def log(msg: str) -> None:
    line = f"{datetime.now(VN):%Y-%m-%d %H:%M:%S}  {msg}"
    print(line)
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass  # không ghi được log thì thôi


def load_env() -> dict:
    env: dict = {}
    for f in (ROOT / ".env.local", HERE / ".env"):
        if f.exists():
            for line in f.read_text(encoding="utf-8-sig").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip("\"'")
    return {**env, **{k: v for k, v in os.environ.items() if k.startswith(("VITE_", "BACKUP_"))}}


def day(s):
    return date.fromisoformat(s) if s else None  # ô ngày thật (lọc/sắp xếp được trong Excel)


def when(s) -> str:
    return datetime.fromisoformat(s).astimezone(VN).strftime("%d/%m/%Y %H:%M") if s else ""


def build_rows(plans, details, lookups, users):
    """Dòng phẳng cho 2 sheet. lookups: [{id,name,code}], users: {uuid: tên}."""
    lk = {l["id"]: l for l in lookups}
    nm = lambda i: lk.get(i, {}).get("name") or ""  # noqa: E731
    who = lambda i: users.get(i, "")  # noqa: E731

    def materials(p):  # NV xuất VT theo thứ tự đã chọn
        ms = sorted(p["material_exporters"], key=lambda m: m.get("sort_order") or 0)
        return [n for n in (nm(m["lookup_id"]) for m in ms) if n]

    def plan_shipper(p):  # giống pickShipper ở web: NV xuất TP/BTP, không có thì NV xuất VT đầu tiên
        return nm(p["fg_exporter_id"]) or (materials(p) or [""])[0]

    by_id = {p["id"]: p for p in plans}
    plan_rows = [[
        p["tk_number"], day(p["export_date"]), p["transport_order_no"], nm(p["transport_type_id"]), nm(p["vehicle_id"]), nm(p["driver_id"]),
        nm(p["fg_exporter_id"]), ", ".join(materials(p)), p["note"], who(p["created_by"]), when(p["created_at"]), who(p["updated_by"]), when(p["updated_at"]),
    ] for p in plans]

    detail_rows = []
    for d in details:
        p = by_id.get(d["plan_id"])
        detail_rows.append([
            d["tk_number"], p and p["transport_order_no"], day(d["export_date"]), d["warehouse_slip_no"], lk.get(d["construction_id"], {}).get("code"),
            nm(d["construction_id"]), d["work_item"], nm(d["delivery_unit_id"]), nm(d["receiving_unit_id"]), nm(d["export_type_id"]),
            nm(d["product_id"]), nm(d["unit_id"]), d["quantity"], d["total_weight_kg"],
            nm(d["shipper_id"]) or (plan_shipper(p) if p else ""), nm(p["vehicle_id"]) if p else "", nm(p["driver_id"]) if p else "",
            nm(d["carrier_id"]), d["note"], who(d["created_by"]), when(d["created_at"]), who(d["updated_by"]), when(d["updated_at"]),
        ])
    return plan_rows, detail_rows


def write_xlsx(path: Path, sheets) -> None:
    """sheets: [(tên sheet, cột, dòng)] -> một file Excel nhiều sheet."""
    wb = Workbook(write_only=True)  # ghi tuần tự, không giữ cả bảng trong RAM
    for title, cols, rows in sheets:
        ws = wb.create_sheet(title)
        for i, (_, width, _) in enumerate(cols, 1):
            ws.column_dimensions[get_column_letter(i)].width = width
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}{len(rows) + 1}"
        head = []
        for h, _, _ in cols:
            c = WriteOnlyCell(ws, value=h)
            c.font = Font(bold=True)
            head.append(c)
        ws.append(head)
        fmts = [f for _, _, f in cols]
        for r in rows:
            row = []
            for v, f in zip(r, fmts):
                if f and v is not None:
                    v = WriteOnlyCell(ws, value=v)
                    v.number_format = f
                row.append(v)
            ws.append(row)
    wb.save(path)


def publish(tmp: Path, final: Path) -> None:
    """Đổi file tạm thành file chính, rồi bỏ bản "Tổng hợp *.xlsx" cũ: mỗi thư mục chỉ giữ 1 file. Chỉ xóa file đúng mẫu tên này."""
    os.replace(tmp, final)
    for old in final.parent.glob("Tổng hợp *.xlsx"):
        if old != final:
            try:
                old.unlink()
            except OSError as e:  # đang mở trong Excel / ổ mạng từ chối: không làm hỏng bản sao lưu mới
                log(f"CẢNH BÁO  không xóa được bản cũ {old.name}: {e}")


def make_jobs(base: Path, now: datetime, plan_rows, detail_rows):
    """Mỗi file tổng hợp nằm trong thư mục của phạm vi, lọc theo Ngày xuất:
    toàn bộ -> base; mỗi năm có dữ liệu -> base\\Năm 2026; mỗi tháng -> ...\\Tháng 11; mỗi ngày -> ...\\Ngày 06.
    Năm/tháng/ngày hiện tại luôn có file (kể cả 0 dòng). Dòng không có Ngày xuất chỉ nằm trong "Toàn bộ".
    Trả [(thư mục, đường dẫn file, nhãn, [(sheet, cột, dòng)])], thứ tự: toàn bộ, các năm, các tháng, các ngày."""
    today = now.date()
    # Chia dòng vào từng năm/tháng/ngày trong một lượt (không lọc lại cả bảng cho từng ngày: ~1.400 ngày x 40.000 dòng).
    groups = {}  # (loại, khóa) -> [dòng Nhập phiếu, dòng Bảng kiểm]
    for n, (rows, i) in enumerate(((plan_rows, 1), (detail_rows, 2))):  # i = vị trí cột Ngày xuất trong dòng
        for r in rows:
            x = r[i]
            if x:
                for k in (("y", x.year), ("m", (x.year, x.month)), ("d", x)):
                    groups.setdefault(k, ([], []))[n].append(r)
    for k in (("y", today.year), ("m", (today.year, today.month)), ("d", today)):
        groups.setdefault(k, ([], []))

    def job(folder, label, plans, details):
        return (folder, folder / f"Tổng hợp {label}.xlsx", label, [("Nhập phiếu", PLAN_COLS, plans), ("Bảng kiểm", DETAIL_COLS, details)])

    jobs = [job(base, "Toàn bộ", plan_rows, detail_rows)]
    for kind in ("y", "m", "d"):
        for key in sorted(k[1] for k in groups if k[0] == kind):
            y = key if kind == "y" else key[0] if kind == "m" else key.year
            y_dir = base / f"Năm {y}"
            if kind == "y":
                folder, label = y_dir, f"Năm {y}"
            elif kind == "m":
                folder, label = y_dir / f"Tháng {key[1]:02d}", f"Tháng {key[1]:02d}-{key[0]}"
            else:
                folder, label = y_dir / f"Tháng {key.month:02d}" / f"Ngày {key.day:02d}", f"Ngày {key:%d-%m-%Y}"
            jobs.append(job(folder, label, *groups[(kind, key)]))
    return jobs


class Api:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.s = requests.Session()
        self.s.headers.update({"apikey": key})

    def login(self, user: str, password: str) -> None:
        email = user if "@" in user else f"{user.lower()}@{INTERNAL_EMAIL_DOMAIN}"
        r = self.s.post(f"{self.url}/auth/v1/token", params={"grant_type": "password"}, json={"email": email, "password": password}, timeout=60)
        if not r.ok:
            why = r.json().get("error_code") or r.json().get("msg") or r.text[:100] if r.headers.get("content-type", "").startswith("application/json") else r.text[:100]
            raise RuntimeError(f"Đăng nhập thất bại ({r.status_code}, {why}) bằng email {email}: kiểm tra lại BACKUP_USERNAME/BACKUP_PASSWORD trong sao-luu/.env")
        self.s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"

    def all(self, table: str, select: str) -> list:
        """Phân trang theo id (keyset), 1000 dòng/lượt: ít request nhất (mỗi request = 1 dòng log Supabase)."""
        rows, last = [], 0
        while True:
            r = self.s.get(f"{self.url}/rest/v1/{table}", params={"select": select, "id": f"gt.{last}", "order": "id.asc", "limit": 1000}, timeout=120)
            if not r.ok:
                raise RuntimeError(f"{table}: {r.status_code} {r.text[:200]}")
            data = r.json()
            if not data:
                return rows
            rows += data
            last = data[-1]["id"]

    def user_names(self, ids: list) -> dict:
        names = {}
        for i in range(0, len(ids), 500):
            r = self.s.post(f"{self.url}/rest/v1/rpc/get_user_names", json={"p_ids": ids[i:i + 500]}, timeout=60)
            if not r.ok:
                raise RuntimeError(f"get_user_names: {r.status_code} {r.text[:200]}")
            names.update({u["id"]: u["full_name"] or u["username"] for u in r.json()})
        return names


def main() -> None:
    env = load_env()
    url, key = env.get("VITE_SUPABASE_URL", "").strip(), env.get("VITE_SUPABASE_PUBLISHABLE_KEY", "").strip()
    user, password = env.get("BACKUP_USERNAME", "").strip(), env.get("BACKUP_PASSWORD", "").strip()
    if not url or not key:
        raise RuntimeError("Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY trong .env.local")
    if not user or not password:
        raise RuntimeError("Thiếu BACKUP_USERNAME / BACKUP_PASSWORD trong sao-luu/.env")
    now = datetime.now(VN)
    base = Path(env.get("BACKUP_DIR", "").strip() or DEFAULT_DIR)
    base.mkdir(parents=True, exist_ok=True)  # lỗi ngay nếu ổ Z: chưa nối -> chưa tốn request nào tới Supabase

    api = Api(url, key)
    print("Đang đăng nhập...")
    api.login(user, password)
    print("Đang tải dữ liệu (có thể mất 1-2 phút)...")
    lookups = api.all("lookup_items", "id,name,code")
    plans = api.all("transport_plans", "*,material_exporters:transport_plan_material_exporters(lookup_id,sort_order)")
    details = api.all("inspection_details", "*")
    print(f"Đã tải {len(plans)} phiếu, {len(details)} dòng bảng kiểm. Đang ghi file Excel...")
    ids = sorted({r[k] for r in plans + details for k in ("created_by", "updated_by") if r[k]})
    plan_rows, detail_rows = build_rows(plans, details, lookups, api.user_names(ids))

    jobs = make_jobs(base, now, plan_rows, detail_rows)
    tmps = [j[1].with_name(j[1].name + ".tmp") for j in jobs]
    try:
        for (folder, _, _, sheets), tmp in zip(jobs, tmps):
            folder.mkdir(parents=True, exist_ok=True)
            write_xlsx(tmp, sheets)
        for (_, final, *_), tmp in zip(jobs, tmps):
            publish(tmp, final)  # ghi hết file tạm xong mới đổi tên: không để lại file dở dang trên ổ mạng
    except BaseException:
        for tmp in tmps:
            tmp.unlink(missing_ok=True)
        raise
    d = now.date()
    now_labels = {"Toàn bộ", f"Năm {d:%Y}", f"Tháng {d:%m-%Y}", f"Ngày {d:%d-%m-%Y}"}
    log(f"OK  {base}  {len(jobs)} file. " + "; ".join(f"{label}: {len(s[0][2])} phiếu, {len(s[1][2])} dòng" for _, _, label, s in jobs if label in now_labels))


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):  # pythonw (chạy ẩn theo lịch) không có console
        if stream:
            stream.reconfigure(encoding="utf-8", errors="replace")
    code = 0
    try:
        main()
    except Exception as e:  # noqa: BLE001
        log(f"LỖI  {e}")
        code = 1
    if sys.stdin and sys.stdin.isatty():  # bấm đúp chạy tay: giữ cửa sổ để đọc kết quả (chạy theo lịch thì bỏ qua)
        try:
            input("Nhấn Enter để đóng...")
        except EOFError:
            pass
    sys.exit(code)
