"""So sánh bản đã nạp (<base>_import_*.csv, mặc định v2) với bản mới (import_*.csv)
-> data/clean/_diff_plans.csv, _diff_details.csv, _diff_report.md.

Chạy: python -I data/scripts/diff_import.py [--base v2] [--older v1]
  --base   tiền tố bản đã nạp (file <base>_import_plans.csv / <base>_import_details.csv)
  --older  tiền tố bản trước đó nữa (mặc định v1): dùng để tái tạo nhóm dòng "giữ ngày bản cũ"
           = dòng mà bản <base> đổi ngày xuất so với <older> theo hướng XA tháng của số TK hơn
           (ngày trên DB thật của các dòng này là ngày <older>).
Khóa ghép dòng bảng kiểm: import_ref (BK-<số dòng Excel>); có kiểm dịch dòng bằng nội dung "lõi".
"""
import argparse
import collections
import csv
import sys
from pathlib import Path

CLEAN = Path(__file__).resolve().parents[2] / "data" / "clean"
# nội dung "lõi" của dòng: không đổi khi chỉ sửa số TK / số phiếu / ngày / ghi chú
CORE = ["construction_code", "product", "quantity", "total_weight_kg", "receiving_unit", "export_type", "unit",
        "shipper", "carrier", "work_item", "delivery_unit"]
SKIP = ("import_ref", "source_row")


def load(name):
    with open(CLEAN / name, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def w(path, header, rows):
    with open(CLEAN / path, "w", encoding="utf-8", newline="") as f:
        cw = csv.writer(f, lineterminator="\n")
        cw.writerow(header)
        cw.writerows(rows)


def kg(rows):
    out = collections.defaultdict(float)
    for r in rows:
        out[r["export_type"] or "(trống)"] += float(r["total_weight_kg"] or 0)
    return out


def mdist(d, tk):
    """Lệch tháng giữa ngày xuất và tháng của số TK kiểu mới; None nếu không xác định."""
    if d and tk and "-" in tk and len(tk.split("-")[1]) == 3:
        return abs(int(d[:4]) * 12 + int(d[5:7]) - int(tk[2:6]) * 12 - int(tk[7:9]))
    return None


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="v2")
    ap.add_argument("--older", default="v1")
    a = ap.parse_args()
    base, older = a.base, a.older
    L = []

    # ---- phiếu
    p1 = {r["tk_number"]: r for r in load(f"{base}_import_plans.csv")}
    p2 = {r["tk_number"]: r for r in load("import_plans.csv")}
    added, removed = sorted(p2.keys() - p1.keys()), sorted(p1.keys() - p2.keys())
    cols = [c for c in next(iter(p1.values())) if c != "source_row"]
    prows, colcnt, changed = [], collections.Counter(), 0
    prows += [["thêm mới", t, "", "", ""] for t in added] + [["bị bỏ", t, "", "", ""] for t in removed]
    for t in sorted(p1.keys() & p2.keys()):
        diffs = [c for c in cols if p1[t][c] != p2[t][c]]
        changed += bool(diffs)
        for c in diffs:
            colcnt[c] += 1
            prows.append(["thay đổi", t, c, p1[t][c], p2[t][c]])
    w("_diff_plans.csv", ["change", "tk_number", "column", "old", "new"], prows)
    pad = sum(1 for t in p1.keys() & p2.keys() if p1[t]["transport_order_no"] != p2[t]["transport_order_no"]
              and p2[t]["transport_order_no"] == p1[t]["transport_order_no"].zfill(6))
    L += ["## Phiếu (khóa tk_number)", "",
          f"- {base}: {len(p1)} | mới: {len(p2)}",
          f"- thêm mới: {len(added)} (phiếu tự tạo: {sum(p2[t]['is_stub'] == 'true' for t in added)})",
          f"- bị bỏ: {len(removed)} (phiếu tự tạo: {sum(p1[t]['is_stub'] == 'true' for t in removed)})",
          f"- thay đổi: {changed} phiếu; theo cột: {dict(colcnt)}; riêng transport_order_no: thêm số 0 đầu cho đủ 6 chữ số {pad}, kiểu đổi khác {colcnt['transport_order_no'] - pad}",
          f"- giữ nguyên: {len(p1.keys() & p2.keys()) - changed}", ""]
    if added or removed:
        L += ["Phiếu thêm/bỏ (tối đa 30):", ""] + [f"- {x[0]}: {x[1]}" for x in prows if x[0] != "thay đổi"][:30] + [""]

    # ---- bảng kiểm: ghép theo import_ref
    d1, d2 = load(f"{base}_import_details.csv"), load("import_details.csv")
    r1, r2 = {r["import_ref"]: r for r in d1}, {r["import_ref"]: r for r in d2}
    allc = [c for c in d1[0] if c not in SKIP]
    core = lambda r: tuple(r[c] for c in CORE)
    both = sorted(r1.keys() & r2.keys(), key=lambda k: int(r1[k]["source_row"]))
    only_old = [r1[k] for k in sorted(r1.keys() - r2.keys(), key=lambda k: int(r1[k]["source_row"]))]
    only_new = [r2[k] for k in sorted(r2.keys() - r1.keys(), key=lambda k: int(r2[k]["source_row"]))]
    unchanged = [k for k in both if all(r1[k][c] == r2[k][c] for c in allc)]
    core_bad = [k for k in both if core(r1[k]) != core(r2[k])]

    # dịch dòng: nội dung lõi của ref cũ xuất hiện ở ref khác
    pool = collections.defaultdict(list)
    for r in only_new + [r2[k] for k in core_bad]:
        pool[core(r)].append(r["import_ref"])
    shifted = []
    for r in only_old + [r1[k] for k in core_bad]:
        if pool.get(core(r)):
            shifted.append((r["import_ref"], pool[core(r)].pop(0)))

    # nhóm "giữ ngày bản cũ"
    o = {r["import_ref"]: r for r in load(f"{older}_import_details.csv")}
    held = {}
    for k, r in r1.items():
        x = o.get(k)
        if x and x["export_date"] != r["export_date"]:
            m0, m1 = mdist(x["export_date"], r["tk_number"]), mdist(r["export_date"], r["tk_number"])
            if m0 is not None and m1 is not None and m1 > m0:
                held[k] = x["export_date"]

    # ---- ghi _diff_details.csv (mỗi dòng: loại, ref cũ, ref mới, cột đổi, chi tiết, cờ nhóm giữ ngày bản cũ)
    drows, colcnt, dcols = [], collections.Counter(), collections.Counter()
    slip, tkc, datec = collections.Counter(), collections.Counter(), collections.Counter()
    held_res = collections.Counter()
    for k in both:
        diffs = [c for c in allc if r1[k][c] != r2[k][c]]
        # (ref nằm trong core_bad nhưng có thể chỉ là dòng bị sửa nội dung, không nhất thiết dịch dòng)
        if not diffs:
            continue
        x, y = r1[k], r2[k]
        for c in diffs:
            colcnt[c] += 1
        dcols[",".join(diffs)] += 1
        if "warehouse_slip_no" in diffs:
            s0, s1 = x["warehouse_slip_no"], y["warehouse_slip_no"]
            slip["trống -> có" if s1 and not s0 else "có -> trống" if s0 and not s1 else "đổi giá trị"] += 1
        if "tk_number" in diffs:
            t0, t1 = x["tk_number"], y["tk_number"]
            tkc["trống -> có" if t1 and not t0 else "có -> trống" if t0 and not t1 else "đổi giá trị"] += 1
        flag = ""
        if "export_date" in diffs:
            m0, m1 = mdist(x["export_date"], y["tk_number"]), mdist(y["export_date"], y["tk_number"])
            datec["gần TK hơn" if m0 is not None and m1 is not None and m1 < m0 else
                  "xa TK hơn" if m0 is not None and m1 is not None and m1 > m0 else "khác/không có TK mới"] += 1
        if k in held:
            flag = "giữ-ngày-" + older
            v = y["export_date"]
            held_res["ngày mới = ngày " + older + " (DB đã đúng)" if v == held[k] else
                     "ngày mới = ngày " + base + " (cần UPDATE ngày)" if v == x["export_date"] else
                     "ngày mới khác cả hai (cần UPDATE ngày)"] += 1
            diffs_s = "; ".join(f"{c}: {x[c]!r} -> {y[c]!r}" for c in diffs)
            diffs_s += f"; [ngày trên DB thật = {held[k]}]"
        else:
            diffs_s = "; ".join(f"{c}: {x[c]!r} -> {y[c]!r}" for c in diffs)
        drows.append(["sửa (theo import_ref)", k, k, ",".join(diffs), diffs_s, flag])
    for r in only_new:
        drows.append(["thêm mới", "", r["import_ref"], "", " | ".join(r[c] for c in allc), ""])
    for r in only_old:
        drows.append(["xóa", r["import_ref"], "", "", " | ".join(r[c] for c in allc), ""])
    for a_, b_ in shifted:
        drows.append(["nghi dịch dòng", a_, b_, "", "nội dung lõi của ref cũ nằm ở ref mới", ""])
    w("_diff_details.csv", ["change", "import_ref_old", "import_ref_new", "columns", "detail", "flag"], drows)

    # held trong nhóm 63 nhưng dòng không đổi gì/không còn trong file mới
    held_gone = [k for k in held if k not in r2]
    held_same_as_base = sum(1 for k in held if k in r2 and r2[k]["export_date"] == r1[k]["export_date"])

    sel = sum(1 for r in drows if r[0].startswith("sửa"))
    L += ["## Bảng kiểm (ghép theo import_ref)", "",
          f"- {base}: {len(d1)} dòng | mới: {len(d2)} dòng",
          f"- ref chung: {len(both)}; ref chỉ có ở mới (thêm): {len(only_new)}; ref chỉ có ở {base} (xóa): {len(only_old)}",
          f"- ref chung, giống hệt mọi cột: {len(unchanged)}; có sửa: {sel}",
          f"- cột bị sửa (số dòng): {dict(colcnt)}",
          f"- tổ hợp cột: {dict(dcols.most_common(12))}",
          f"- KIỂM DỊCH DÒNG: ref chung nhưng nội dung lõi ({', '.join(CORE)}) khác: {len(core_bad)}; "
          f"nội dung lõi cũ tìm thấy ở ref khác (nghi dịch): {len(shifted)}",
          f"  => {'KHÔNG dịch dòng' if not core_bad and not shifted else 'CÓ NGHI DỊCH DÒNG - xem _diff_details.csv'}", ""]
    if only_new:
        L += ["Dòng thêm mới (tối đa 20):", ""] + [
            f"- {r['import_ref']}: TK={r['tk_number']!r} ngày={r['export_date']} phiếu={r['warehouse_slip_no']!r} "
            f"CT={r['construction_code']!r} {r['product']!r} SL={r['quantity']} kg={r['total_weight_kg']}" for r in only_new[:20]] + [""]
    if only_old:
        L += ["Dòng bị xóa (tối đa 20):", ""] + [f"- {r['import_ref']}: TK={r['tk_number']!r} ngày={r['export_date']}" for r in only_old[:20]] + [""]
    L += ["## Cột thay đổi (ghép theo import_ref)", "",
          f"- số TK: {dict(tkc)}", f"- số phiếu xuất kho: {dict(slip)}",
          f"- ngày xuất đổi {sum(datec.values())} dòng, so với tháng của số TK mới: {dict(datec)}", "",
          f"## Nhóm {len(held)} dòng đang giữ ngày bản {older} trên DB (tái tạo: {base} đổi ngày xa tháng TK hơn so với {older})", "",
          f"- tái tạo được: {len(held)} dòng; còn trong file mới: {len(held) - len(held_gone)}; biến mất: {len(held_gone)}",
          f"- ngày trong file mới của nhóm này (đánh dấu cột 'flag' trong _diff_details.csv): {dict(held_res)}",
          f"- file mới không đổi ngày so với {base}: {held_same_as_base}/{len(held)} -> ngày DB (= {older}) khác file; "
          f"muốn khớp file thì UPDATE ngày, còn muốn giữ ngày {older} thì loại export_date khỏi lệnh UPDATE của các ref này", ""]

    # ---- kg
    k1, k2 = kg(d1), kg(d2)
    L += ["## Tổng khối lượng (kg) theo loại hình xuất", "", f"| Loại hình xuất | {base} | mới | chênh |", "|---|---:|---:|---:|"]
    for t in sorted(k1.keys() | k2.keys()):
        L.append(f"| {t} | {k1[t]:,.3f} | {k2[t]:,.3f} | {k2[t] - k1[t]:+,.3f} |")
    L.append(f"| **Tổng** | {sum(k1.values()):,.3f} | {sum(k2.values()):,.3f} | {sum(k2.values()) - sum(k1.values()):+,.3f} |")
    L.append("")

    # ---- danh mục mới chưa có trong doi-chieu.xlsx (do --build ghi)
    nf = CLEAN / "_new_catalog_values.csv"
    L += ["## Giá trị danh mục chưa có trong doi-chieu.xlsx", ""]
    if nf.exists():
        rows = load("_new_catalog_values.csv")
        L += [f"- {len(rows)} giá trị:"] + [f"  - [{r['sheet']}] {r['value']!r} ({r['rows']} dòng)" for r in rows]
    else:
        L.append("- không có (không có file _new_catalog_values.csv)")
    (CLEAN / "_diff_report.md").write_text(f"# Báo cáo chênh lệch {base} (đã nạp) và bản mới\n\n" + "\n".join(L) + "\n", encoding="utf-8")
    print("\n".join(L))


if __name__ == "__main__":
    main()

