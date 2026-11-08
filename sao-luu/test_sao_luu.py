"""Kiểm tra phần dựng dòng + ghi Excel bằng dữ liệu giả (không gọi Supabase). Chạy: python sao-luu/test_sao_luu.py"""
import tempfile
from datetime import date
from pathlib import Path

from openpyxl import load_workbook

import sao_luu as s

lookups = [{"id": 1, "name": "Xe 29C", "code": None}, {"id": 2, "name": "Nguyễn Văn A", "code": None},
           {"id": 3, "name": "Công trình Hà Nội", "code": "CT01"}, {"id": 4, "name": "Bộ", "code": None}]
plans = [{"id": 10, "tk_number": "TK2026/11-001", "export_date": "2026-11-05", "transport_order_no": "VC1", "transport_type_id": None,
          "vehicle_id": 1, "driver_id": 2, "fg_exporter_id": None, "note": None, "created_by": "u1", "created_at": "2026-11-05T08:00:00+00:00",
          "updated_by": None, "updated_at": "2026-11-05T08:00:00+00:00", "material_exporters": [{"lookup_id": 2, "sort_order": 1}]}]
details = [{"plan_id": 10, "tk_number": "TK2026/11-001", "export_date": "2026-11-05", "warehouse_slip_no": "PXK1", "construction_id": 3,
            "work_item": "HM", "delivery_unit_id": None, "receiving_unit_id": None, "export_type_id": None, "product_id": None, "unit_id": 4,
            "quantity": 1234.5, "total_weight_kg": 10, "shipper_id": None, "carrier_id": None, "note": None, "created_by": "u1",
            "created_at": "2026-11-05T08:00:00+00:00", "updated_by": None, "updated_at": "2026-11-05T08:00:00+00:00"}]

pr, dr = s.build_rows(plans, details, lookups, {"u1": "Lê Thái Bão"})
assert pr[0][7] == "Nguyễn Văn A" and pr[0][9] == "Lê Thái Bão" and pr[0][10] == "05/11/2026 15:00"  # giờ UTC -> Việt Nam
assert dr[0][1] == "VC1" and dr[0][4] == "CT01" and dr[0][14] == "Nguyễn Văn A" and dr[0][15] == "Xe 29C"  # thừa hưởng từ phiếu cha

with tempfile.TemporaryDirectory() as d:
    f = Path(d) / "t.xlsx"
    s.write_xlsx(f, [("Nhập phiếu", s.PLAN_COLS, pr), ("Bảng kiểm", s.DETAIL_COLS, dr)])
    wb = load_workbook(f)
    assert wb.sheetnames == ["Nhập phiếu", "Bảng kiểm"] and wb["Nhập phiếu"]["A2"].value == "TK2026/11-001"
    ws = wb["Bảng kiểm"]
    assert ws["A1"].font.bold and ws.freeze_panes == "A2" and ws.auto_filter.ref == "A1:W2"
    assert ws["C2"].value.date() == date(2026, 11, 5) and ws["C2"].number_format == "dd/mm/yyyy"
    assert ws["M2"].value == 1234.5 and ws["M2"].number_format == "#,##0.##"
from datetime import datetime  # noqa: E402

# Phạm vi: ngày xuất 06/11/2026 (hôm nay), 01/11/2026 (cùng tháng), 05/01/2026 (cùng năm), 31/12/2025, không có ngày
fake = [[None, d] for d in (date(2026, 11, 6), date(2026, 11, 1), date(2026, 1, 5), date(2025, 12, 31), None)]
jobs = s.make_jobs(Path("x"), datetime(2026, 11, 6, 16, 50, tzinfo=s.VN), fake, [[None, None, r[1]] for r in fake])
got = [(j[1].relative_to("x").as_posix(), len(j[3][0][2]), len(j[3][1][2])) for j in jobs]  # (đường dẫn file, số phiếu, số dòng bảng kiểm)
assert got == [
    ("Tổng hợp Toàn bộ.xlsx", 5, 5),
    ("Năm 2025/Tổng hợp Năm 2025.xlsx", 1, 1), ("Năm 2026/Tổng hợp Năm 2026.xlsx", 3, 3),
    ("Năm 2025/Tháng 12/Tổng hợp Tháng 12-2025.xlsx", 1, 1), ("Năm 2026/Tháng 01/Tổng hợp Tháng 01-2026.xlsx", 1, 1),
    ("Năm 2026/Tháng 11/Tổng hợp Tháng 11-2026.xlsx", 2, 2),
    ("Năm 2025/Tháng 12/Ngày 31/Tổng hợp Ngày 31-12-2025.xlsx", 1, 1), ("Năm 2026/Tháng 01/Ngày 05/Tổng hợp Ngày 05-01-2026.xlsx", 1, 1),
    ("Năm 2026/Tháng 11/Ngày 01/Tổng hợp Ngày 01-11-2026.xlsx", 1, 1), ("Năm 2026/Tháng 11/Ngày 06/Tổng hợp Ngày 06-11-2026.xlsx", 1, 1),
], got
# Hôm nay chưa có dữ liệu: năm/tháng/ngày hiện tại vẫn có file (0 dòng) để biết đã sao lưu
j7 = s.make_jobs(Path("x"), datetime(2026, 11, 7, 16, 50, tzinfo=s.VN), fake, [])
assert [(j[1].name, len(j[3][0][2])) for j in j7 if j[2] == "Ngày 07-11-2026"] == [("Tổng hợp Ngày 07-11-2026.xlsx", 0)]

# Mỗi thư mục chỉ giữ 1 file "Tổng hợp": bản cũ bị bỏ, file/thư mục khác không đụng tới
with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    (d / "Tổng hợp Ngày 05-11-2026_2026-11-05_16h50.xlsx").write_text("cu")  # tên kiểu cũ có ngày giờ
    (d / "Tổng hợp Ngày 06-11-2026.xlsx").write_text("hom-qua")  # cùng tên: bị ghi đè
    (d / "ghi-chu.xlsx").write_text("khac")
    (d / "Năm 2025").mkdir()
    (d / "moi.tmp").write_text("moi")
    s.publish(d / "moi.tmp", d / "Tổng hợp Ngày 06-11-2026.xlsx")
    assert sorted(p.name for p in d.iterdir()) == ["Năm 2025", "Tổng hợp Ngày 06-11-2026.xlsx", "ghi-chu.xlsx"]
    assert (d / "Tổng hợp Ngày 06-11-2026.xlsx").read_text() == "moi"
# Phạm vi chỉ định (--ngay/--thang/--nam/--toan-bo): nhận nhiều kiểu ngày, sai định dạng thì báo lỗi
assert s.scope_labels(["05/11/2026", "2026-11-06"], ["10/2026", "2026-11"], ["2025"]) == {
    "Ngày 05-11-2026", "Ngày 06-11-2026", "Tháng 10-2026", "Tháng 11-2026", "Năm 2025"}
assert s.scope_labels() == set()
from argparse import Namespace  # noqa: E402

# --toan-bo (hoặc không tham số) = sao lưu đầy đủ, không lọc; có chỉ định thì chỉ các phạm vi đó
assert s.chosen_labels(None) == set()
assert s.chosen_labels(Namespace(ngay=None, thang=None, nam=None, toan_bo=True)) == set()
assert s.chosen_labels(Namespace(ngay=["05/11/2026"], thang=None, nam=None, toan_bo=True)) == set()
assert s.chosen_labels(Namespace(ngay=["05/11/2026"], thang=None, nam=["2025"], toan_bo=False)) == {"Ngày 05-11-2026", "Năm 2025"}
for bad in (dict(ngay=["31/02/2026"]), dict(thang=["13/2026"]), dict(nam=["abc"])):
    try:
        s.scope_labels(**bad)
        raise SystemExit(f"phải báo lỗi: {bad}")
    except ValueError:
        pass
print("OK")
