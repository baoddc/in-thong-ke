"""Tạo SQL CHỈ THÊM dữ liệu mới từ chuan-bi/mau-nap-du-lieu.xlsx (so với bản đã nạp), không sửa/xóa dữ liệu cũ.

Chạy (từ thư mục gốc):  python -X utf8 -I data/scripts/import_nhap_lieu.py --build   # dựng import_*.csv từ file Excel
                        python -X utf8 -I data/scripts/make_insert_new.py --base v4 [--skip TK... TK...]
Ra data/clean/ (chứa dữ liệu nên không commit):
  them-moi.sql                      một file chạy một lần trong Supabase SQL Editor
  chua-nap_phieu.csv / chua-nap_bang-kiem.csv   dòng của số TK trong --skip (trùng số TK với phiếu đã có trên web): KHÔNG nạp
Phiếu mới: insert ... on conflict (tk_number) do nothing. Dòng bảng kiểm mới: gắn vào phiếu mới hoặc phiếu cũ theo số TK;
on conflict (import_ref) do nothing. Không UPDATE/DELETE bảng nào.
"""
import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I không tự thêm thư mục của script
import make_delta as md  # noqa: E402  dùng lại q/values/norm_du/load (không chạy main)

CLEAN = md.CLEAN
q, values, names = md.q, md.values, md.names
KINDS_D = ("delivery_unit", "receiving_unit", "export_type", "product", "unit", "carrier")


def write_csv(name, rows):
    if rows:
        with open(CLEAN / name, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0]))
            w.writeheader()
            w.writerows(rows)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="v4")
    ap.add_argument("--skip", nargs="*", default=[], help="số TK không nạp (đã có trên web với nội dung khác)")
    a = ap.parse_args()
    p_old, p_new = md.load(f"{a.base}_import_plans.csv"), md.load("import_plans.csv")
    d_old, d_new = md.load(f"{a.base}_import_details.csv"), md.load("import_details.csv")
    old_tk, old_ref, skip = {r["tk_number"] for r in p_old}, {r["import_ref"] for r in d_old}, set(a.skip)

    add_p = [r for r in p_new if r["tk_number"] not in old_tk]
    # 'An Hạ' đã được đổi tên thành 'Kho An Hạ' trên DB (T-081): không để tạo lại mục cũ
    du = lambda v: md.KHO if v.strip().lower() == "an hạ" else md.norm_du(v)  # noqa: E731
    add_d = [{**r, "delivery_unit": du(r["delivery_unit"])} for r in d_new if r["import_ref"] not in old_ref]
    plans = [r for r in add_p if r["tk_number"] not in skip]
    details = [r for r in add_d if r["tk_number"] not in skip]
    write_csv("chua-nap_phieu.csv", [r for r in add_p if r["tk_number"] in skip])
    write_csv("chua-nap_bang-kiem.csv", [r for r in add_d if r["tk_number"] in skip])
    assert {r["tk_number"] for r in details if r["tk_number"]} <= {r["tk_number"] for r in p_new}, "dòng mới trỏ tới số TK không có trong file"

    need, ppl = set(), set()
    for r in plans:
        need.update((k, r[k]) for k in ("transport_type", "vehicle", "driver") if r[k])
        if r["fg_exporter"]:
            ppl.add(("fg_exporter", r["fg_exporter"]))
        ppl.update(("material_exporter", n) for n in names(r["material_exporter"]))
    for r in details:
        need.update((k, r[k]) for k in KINDS_D if r[k])
    ppl.update(("material_exporter", r["shipper"]) for r in details if r["shipper"])
    cons = sorted({r["construction_code"] for r in details if r["construction_code"]})
    plan_rows = [[r["tk_number"], r["tk_year"], r["tk_month"], r["tk_seq"], r["export_date"], r["transport_order_no"],
                  r["transport_type"], r["vehicle"], r["driver"], r["fg_exporter"], r["note"]] for r in plans]
    mx_rows = [[r["tk_number"], n, str(i)] for r in plans for i, n in enumerate(dict.fromkeys(names(r["material_exporter"])))]
    det_rows = [[r["import_ref"]] + [r[c] for c in md.D_COLS] for r in details]
    vc_rows = [[r["tk_number"], r["transport_order_no"]] for r in plans]
    lk = "public.lookup_items"

    s = [
        "-- NẠP THÊM dữ liệu mới từ mau-nap-du-lieu.xlsx. CHỈ INSERT: không sửa, không xóa dữ liệu cũ. Tạo bởi data/scripts/make_insert_new.py.",
        f"-- {len(plans)} phiếu mới, {len(details)} dòng bảng kiểm mới. Chạy cả file MỘT lần trong Supabase SQL Editor; chạy lại cũng không trùng.",
        "set session characteristics as transaction read write;",
        "do $$ begin assert exists (select 1 from public.profiles where username = 'bao.lt'), 'Chưa có tài khoản bao.lt'; end $$;",
        "",
        "-- Hàm tra id danh mục (xóa ở cuối file): ưu tiên mục đang dùng, không có thì mục đã ẩn.",
        "create or replace function public._ins_lk(p_kind text, p_name text) returns bigint language sql stable set search_path = '' as $f$",
        "  select id from public.lookup_items where kind = p_kind and lower(name) = lower(p_name) order by (archived_at is null) desc, id limit 1 $f$;",
        "create or replace function public._ins_con(p_code text) returns bigint language sql stable set search_path = '' as $f$",
        "  select id from public.lookup_items where kind = 'construction' and lower(code) = lower(p_code) order by (archived_at is null) desc, id limit 1 $f$;",
        "create or replace function public._ins_person(p_kind text, p_name text) returns bigint language sql stable set search_path = '' as $f$",
        "  select id from public.lookup_items where kind in ('fg_exporter', 'material_exporter') and lower(name) = lower(p_name)",
        "  order by (kind = p_kind) desc, (archived_at is null) desc, id limit 1 $f$;",
        "revoke all on function public._ins_lk(text, text), public._ins_con(text), public._ins_person(text, text) from public, anon, authenticated;",
        "",
        "-- 1. Danh mục còn thiếu (đã có thì không thêm)",
    ]
    if need:
        s += [f"insert into {lk} (kind, name)", f"select v.k, v.n from (values\n{values([list(x) for x in sorted(need)])}\n) v(k, n)",
              "where public._ins_lk(v.k, v.n) is null;"]
    if ppl:
        s += [f"insert into {lk} (kind, name)", f"select distinct on (lower(v.n)) v.k, v.n from (values\n{values([list(x) for x in sorted(ppl)])}\n) v(k, n)",
              "where public._ins_person(v.k, v.n) is null order by lower(v.n), v.k;"]
    if cons:
        s += [f"insert into {lk} (kind, code, name)", f"select 'construction', v.c, v.c from (values\n{values([[c] for c in cons])}\n) v(c)",
              "where public._ins_con(v.c) is null;"]
    s += [
        "",
        "-- 2. Phiếu mới + NV xuất VT của phiếu mới. Số TK đã có trên DB: do nothing (giữ nguyên phiếu cũ).",
        "with newp(tk, y, m, s, ed, ord, tt, ve, dr, fg, note) as (values",
        values(plan_rows),
        "),",
        "ins_p as (",
        "  insert into public.transport_plans (tk_number, tk_year, tk_month, tk_seq, export_date, transport_order_no,",
        "    transport_type_id, vehicle_id, driver_id, fg_exporter_id, note, created_at, created_by, require_complete)",
        "  select p.tk, p.y::int, p.m::int, p.s::int, p.ed::date, p.ord, public._ins_lk('transport_type', p.tt), public._ins_lk('vehicle', p.ve),",
        "    public._ins_lk('driver', p.dr), public._ins_person('fg_exporter', p.fg), p.note,",
        "    coalesce(p.ed::date::timestamp at time zone 'Asia/Ho_Chi_Minh', now()), (select id from public.profiles where username = 'bao.lt'), false",
        "  from newp p",
        "  on conflict (tk_number) do nothing",
        "  returning id, tk_number",
        "),",
        "ins_m as (",
        "  insert into public.transport_plan_material_exporters (plan_id, lookup_id, sort_order)",
        "  select ip.id, public._ins_person('material_exporter', v.n), v.o::int from (values",
        values(mx_rows),
        "  ) v(tk, n, o) join ins_p ip on ip.tk_number = v.tk",
        "  where public._ins_person('material_exporter', v.n) is not null",
        "  on conflict do nothing",
        "  returning 1",
        ")",
        "select (select count(*) from ins_p) as phieu_them, (select count(*) from ins_m) as nv_xuat_vt_them;",
        "",
        "-- 3. Dòng bảng kiểm mới (câu RIÊNG, sau câu trên: trigger điền số TK cần thấy phiếu vừa thêm).",
        "--    Dòng của số TK mới chỉ gắn vào phiếu có cùng số lệnh VC với phiếu trong file (không gắn nhầm vào phiếu khác trùng số TK).",
        "with newp(tk, ord) as (values",
        values(vc_rows),
        "),",
        "newd(ref, tk, ed, slip, cons, item, du, ru, et, pr, un, qty, wt, sh, ca, note) as (values",
        values(det_rows),
        ")",
        "insert into public.inspection_details (plan_id, export_date, warehouse_slip_no, construction_id, delivery_unit_id,",
        "  receiving_unit_id, export_type_id, product_id, unit_id, carrier_id, shipper_id, work_item, quantity,",
        "  total_weight_kg, note, import_ref, created_at, created_by, require_complete)",
        "-- shipper_id chỉ ghi khi người xuất hàng KHÁC NV xuất theo phiếu (TP/BTP, rồi NV xuất VT đầu tiên) — như D-010",
        "select p.id, b.ed::date, b.slip, public._ins_con(b.cons), public._ins_lk('delivery_unit', b.du), public._ins_lk('receiving_unit', b.ru),",
        "  public._ins_lk('export_type', b.et), public._ins_lk('product', b.pr), public._ins_lk('unit', b.un), public._ins_lk('carrier', b.ca),",
        "  case when b.sh is not null and lower(b.sh) is distinct from lower(coalesce(fg.name, mx.name)) then public._ins_person('material_exporter', b.sh) end,",
        "  b.item, b.qty::numeric, b.wt::numeric, b.note, b.ref,",
        "  coalesce(b.ed::date::timestamp at time zone 'Asia/Ho_Chi_Minh', now()), (select id from public.profiles where username = 'bao.lt'), false",
        "from newd b",
        "left join public.transport_plans p on p.tk_number = b.tk",
        f"left join {lk} fg on fg.id = p.fg_exporter_id",
        "left join lateral (select l.name from public.transport_plan_material_exporters m join public.lookup_items l on l.id = m.lookup_id",
        "  where m.plan_id = p.id order by m.sort_order, m.lookup_id limit 1) mx on true",
        "where b.tk is null",
        "  or not exists (select 1 from newp n where n.tk = b.tk)",
        "  or exists (select 1 from newp n where n.tk = b.tk and p.transport_order_no is not distinct from n.ord)",
        "on conflict (import_ref) where import_ref is not null do nothing;",
        "",
        "drop function public._ins_lk(text, text), public._ins_con(text), public._ins_person(text, text);",
        "",
        "-- Kiểm sau: đủ số phiếu/dòng mới; phiếu cũ không đổi",
        f"select (select count(*) from public.transport_plans where tk_number = any(array[{', '.join(q(r['tk_number']) for r in plans)}])) as phieu_moi_tren_db, {len(plans)} as ky_vong_phieu,",
        f"  (select count(*) from public.inspection_details where import_ref = any(array[{', '.join(q(r['import_ref']) for r in details)}])) as dong_moi_tren_db, {len(details)} as ky_vong_dong,",
        "  (select count(*) from public.transport_plans where tk_year < 2100) as tong_phieu,",
        "  (select count(*) from public.inspection_details where import_ref is not null and import_ref not like 'LOADTEST-%') as tong_dong_da_nap"
        + (f",\n  (select string_agg(tk_number || ' (VC ' || coalesce(transport_order_no, '-') || ')', ', ') from public.transport_plans where tk_number = any(array[{', '.join(q(t) for t in sorted(skip))}])) as phieu_web_giu_nguyen;" if skip else ";"),
    ]
    sql = "\n".join(s) + "\n"
    try:  # kiểm cú pháp nếu có pglast
        import pglast
        pglast.parse_sql(sql)
        print("pglast: cú pháp OK")
    except ImportError:
        print("(không có pglast: chưa kiểm cú pháp)")
    assert " update " not in sql.lower().replace("\n", " ").replace("on conflict", "") and "delete from" not in sql.lower(), "file chỉ được INSERT"
    (CLEAN / "them-moi.sql").write_text(sql, encoding="utf-8")
    # Xem trước (chỉ SELECT, không cần hàm phụ): danh mục nào CHƯA có trên DB, sẽ được them-moi.sql thêm vào
    parts = []
    if need:
        parts.append(f"select v.k as loai, v.n as ten from (values\n{values([list(x) for x in sorted(need)])}\n) v(k, n)\n"
                     f"where not exists (select 1 from {lk} l where l.kind = v.k and lower(l.name) = lower(v.n))")
    if ppl:
        parts.append(f"select v.k, v.n from (values\n{values([list(x) for x in sorted(ppl)])}\n) v(k, n)\n"
                     f"where not exists (select 1 from {lk} l where l.kind in ('fg_exporter', 'material_exporter') and lower(l.name) = lower(v.n))")
    if cons:
        parts.append(f"select 'construction', v.c from (values\n{values([[c] for c in cons])}\n) v(c)\n"
                     f"where not exists (select 1 from {lk} l where l.kind = 'construction' and lower(l.code) = lower(v.c))")
    (CLEAN / "them-moi_xem-truoc.sql").write_text("\nunion all\n".join(parts) + ";\n", encoding="utf-8")
    print(f"phiếu mới {len(plans)} (bỏ {len(add_p) - len(plans)} theo --skip), NV xuất VT {len(mx_rows)} lượt, dòng bảng kiểm mới {len(details)} (bỏ {len(add_d) - len(details)}); "
          f"danh mục cần có {len(need)}, người {len(ppl)}, công trình {len(cons)}; them-moi.sql {(CLEAN / 'them-moi.sql').stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
