"""T-081: tạo SQL nạp phần CHÊNH LỆCH giữa bản đã nạp (v3_import_*.csv) và bản mới (import_*.csv).

Chạy (từ thư mục gốc):  python -I data/scripts/make_delta.py [--base v3]
Ra 2 file trong data/clean/ (chứa dữ liệu nên không commit):
  delta_01_chuan-bi.sql  tạo bảng phụ _delta_keep_tk (mọi số TK của file mới) + XEM TRƯỚC, không đổi dữ liệu
  delta_02_ap-dung.sql   xóa phiếu/dòng tạo thử trên web, danh mục, upsert phiếu + NV xuất VT,
                         upsert dòng bảng kiểm, đổi Đơn vị giao, xóa bảng phụ — mọi câu chạy lại được
Không dùng bảng tạm / pg_temp: SQL Editor của Supabase lưu từng câu nên bảng tạm 'on commit drop' mất ngay (lỗi 42P01 lần 1).
Quyết định người dùng 04/11/2026: phiếu web là phiếu thử → xóa; "An Hạ" đổi tên "Kho An Hạ", thêm AH1..AH6;
áp dụng mọi thay đổi theo file; 63 dòng giữ ngày đã chốt (không đụng ngày dòng cũ — chỉ upsert dòng đổi nội dung).
"""
import argparse
import csv
import re
import sys
from pathlib import Path

CLEAN = Path(__file__).resolve().parents[2] / "data" / "clean"
KHO = "Kho An Hạ"
P_COLS = ["export_date", "transport_order_no", "transport_type", "vehicle", "driver", "fg_exporter", "material_exporter", "note"]
D_COLS = ["tk_number", "export_date", "warehouse_slip_no", "construction_code", "work_item", "delivery_unit", "receiving_unit",
          "export_type", "product", "unit", "quantity", "total_weight_kg", "shipper", "carrier", "note"]


def load(name):
    with open(CLEAN / name, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def q(v):
    """Chuỗi -> literal SQL ('' -> null)."""
    return "null" if v is None or v == "" else "'" + v.replace("'", "''") + "'"


def values(rows):
    return ",\n".join("  (" + ", ".join(q(x) for x in r) + ")" for r in rows)


def names(s):
    return [x for x in (s or "").split(";") if x]


def norm_du(v):
    """Đơn vị giao: trống / chữ tiêu đề 'Nơi xuất' -> KHO (mặc định như lần nạp đầu);
    tổ hợp kho 'AH4+AH2', 'AH2 + AH4' -> 'AH2 + AH4' (bỏ trùng, sắp tăng dần) để không sinh nhiều mục cùng nghĩa."""
    if not v or v.strip().lower() == "nơi xuất":
        return KHO
    parts = [p.strip().upper() for p in v.split("+")]
    if len(parts) > 1 and all(re.fullmatch(r"AH\d+", p) for p in parts):
        return " + ".join(sorted(set(parts), key=lambda p: int(p[2:])))
    return v


def plan_delta(old, new):
    """-> phiếu cần upsert (thêm mới + đổi nội dung)."""
    o = {r["tk_number"]: r for r in old}
    return [r for r in new if r["tk_number"] not in o or any(o[r["tk_number"]][c] != r[c] for c in P_COLS)]


def detail_delta(old, new):
    """-> (dòng upsert đủ cột, {đơn vị giao: [import_ref]} cho dòng CHỈ đổi đơn vị giao sang khác KHO).
    Dòng chỉ đổi 'An Hạ' -> KHO không cần ghi: đổi tên danh mục là đủ."""
    o = {r["import_ref"]: r for r in old}
    full, du = [], {}
    new = [{**r, "delivery_unit": norm_du(r["delivery_unit"])} for r in new]
    for r in new:
        x = o.get(r["import_ref"])
        if x is None:
            full.append(r)
            continue
        diff = [c for c in D_COLS if x[c] != r[c]]
        if not diff or (diff == ["delivery_unit"] and r["delivery_unit"] == KHO and x["delivery_unit"] == "An Hạ"):
            continue
        if diff == ["delivery_unit"]:
            du.setdefault(r["delivery_unit"], []).append(r["import_ref"])
        else:
            full.append(r)
    return full, du


def selftest():
    p_old = [{"tk_number": "A", **{c: "" for c in P_COLS}}]
    p_new = [{"tk_number": "A", **{c: "" for c in P_COLS}}, {"tk_number": "B", **{c: "" for c in P_COLS}}]
    assert [r["tk_number"] for r in plan_delta(p_old, p_new)] == ["B"]
    p_new[0]["material_exporter"] = "X;Y"
    assert [r["tk_number"] for r in plan_delta(p_old, p_new)] == ["A", "B"]
    base = {c: "" for c in D_COLS}
    d_old = [{"import_ref": "1", **base, "delivery_unit": "An Hạ"}, {"import_ref": "2", **base, "delivery_unit": "An Hạ"},
             {"import_ref": "3", **base, "delivery_unit": "An Hạ"}]
    d_new = [{"import_ref": "1", **base, "delivery_unit": KHO}, {"import_ref": "2", **base, "delivery_unit": "AH1"},
             {"import_ref": "3", **base, "delivery_unit": KHO, "quantity": "5"}, {"import_ref": "4", **base}]
    full, du = detail_delta(d_old, d_new)
    assert [r["import_ref"] for r in full] == ["3", "4"] and du == {"AH1": ["2"]}
    assert norm_du("AH4+AH2") == "AH2 + AH4" == norm_du("AH2 + AH4 + AH2") and norm_du("Nơi xuất") == KHO == norm_du("")
    assert norm_du("AH1") == "AH1" and norm_du("Kho Long An") == "Kho Long An"
    assert q("O'Neil") == "'O''Neil'" and q("") == "null"
    assert names("a;b;") == ["a", "b"]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="v3")
    a = ap.parse_args()
    selftest()
    p_old, p_new = load(f"{a.base}_import_plans.csv"), load("import_plans.csv")
    d_old, d_new = load(f"{a.base}_import_details.csv"), load("import_details.csv")
    plans = plan_delta(p_old, p_new)
    details, du = detail_delta(d_old, d_new)

    # danh mục cần có (kind, tên) — công trình theo mã riêng
    need, ppl = set(), set()
    for r in plans:
        for k in ("transport_type", "vehicle", "driver"):
            if r[k]:
                need.add((k, r[k]))
        if r["fg_exporter"]:
            ppl.add(("fg_exporter", r["fg_exporter"]))
        ppl.update(("material_exporter", n) for n in names(r["material_exporter"]))
    for r in details:
        for k in ("delivery_unit", "receiving_unit", "export_type", "product", "unit", "carrier"):
            if r[k]:
                need.add((k, r[k]))
    need.update(("delivery_unit", k) for k in du)
    need.discard(("delivery_unit", KHO))  # có sau khi đổi tên "An Hạ"
    ppl.update(("material_exporter", r["shipper"]) for r in details if r["shipper"])
    people = [list(x) for x in sorted(ppl)]
    cons = sorted({r["construction_code"] for r in details if r["construction_code"]})
    keep = sorted({r["tk_number"] for r in p_new})
    lk_rows = sorted(need)
    plan_rows = [[r["tk_number"], r["tk_year"], r["tk_month"], r["tk_seq"], r["export_date"], r["transport_order_no"],
                  r["transport_type"], r["vehicle"], r["driver"], r["fg_exporter"], r["note"]] for r in plans]
    mx_rows = [[r["tk_number"], n, str(i)] for r in plans for i, n in enumerate(dict.fromkeys(names(r["material_exporter"])))]
    det_rows = [[r["import_ref"]] + [r[c] for c in D_COLS] for r in details]

    f1 = [
        "-- T-081 bước 1/2: CHUẨN BỊ + XEM TRƯỚC (không đổi dữ liệu thật). Tạo bởi data/scripts/make_delta.py.",
        "-- Yêu cầu: đã chạy migration 000021..000024. Chạy cả file một lần, đọc kết quả cuối rồi mới chạy delta_02_ap-dung.sql.",
        "set session characteristics as transaction read write;",
        "drop table if exists public._delta_keep_tk;",
        "create table public._delta_keep_tk (tk text primary key);",
        "alter table public._delta_keep_tk enable row level security; -- bảng phụ, web không đọc được",
        "insert into public._delta_keep_tk (tk) values\n" + ",\n".join(f"  ({q(t)})" for t in keep) + ";",
        "",
        "-- Bảng phụ dữ liệu cần nạp (bảng thật, không dùng bảng tạm: SQL Editor của Supabase không giữ bảng tạm giữa các câu)",
        "drop table if exists public._delta_p, public._delta_d;",
        "create table public._delta_p as select * from (values",
        values(plan_rows),
        ") v(tk, y, m, s, ed, ord, tt, ve, dr, fg, note);",
        "create table public._delta_d as select * from (values",
        values(det_rows),
        ") v(ref, tk, ed, slip, cons, item, du, ru, et, pr, un, qty, wt, sh, ca, note);",
        "alter table public._delta_p enable row level security;",
        "alter table public._delta_d enable row level security;",
        "",
        "-- Tra id danh mục: ưu tiên mục đang dùng, không có thì mục đã ẩn (D-026) — phiếu cũ vẫn giữ đúng tên.",
        "create or replace function public._delta_lk(p_kind text, p_name text) returns bigint language sql stable set search_path = '' as $f$",
        "  select id from public.lookup_items where kind = p_kind and lower(name) = lower(p_name) order by (archived_at is null) desc, id limit 1 $f$;",
        "create or replace function public._delta_con(p_code text) returns bigint language sql stable set search_path = '' as $f$",
        "  select id from public.lookup_items where kind = 'construction' and lower(code) = lower(p_code) order by (archived_at is null) desc, id limit 1 $f$;",
        "-- Người: tìm ở cả NV xuất TP/BTP lẫn VT (sau khi dọn danh mục một người chỉ còn ở một bên), ưu tiên đúng danh mục.",
        "create or replace function public._delta_person(p_kind text, p_name text) returns bigint language sql stable set search_path = '' as $f$",
        "  select id from public.lookup_items where kind in ('fg_exporter', 'material_exporter') and lower(name) = lower(p_name)",
        "  order by (kind = p_kind) desc, (archived_at is null) desc, id limit 1 $f$;",
        "revoke all on function public._delta_lk(text, text), public._delta_con(text), public._delta_person(text, text) from public, anon, authenticated;",
        "",
        "-- Xem trước: những gì delta_02 sẽ XÓA (dữ liệu tạo thử trên web) và đụng tới",
        "select 'dòng bảng kiểm tạo trên web (import_ref trống) — sẽ xóa' as muc, count(*)::text as so from public.inspection_details where import_ref is null",
        "union all select 'phiếu không có trong file (tạo trên web) — sẽ xóa', count(*)::text from public.transport_plans t",
        "  where t.tk_year < 2100 and not exists (select 1 from public._delta_keep_tk k where k.tk = t.tk_number)",
        "union all select 'ví dụ phiếu sẽ xóa', string_agg(tk_number, ', ') from (select tk_number from public.transport_plans t",
        "  where t.tk_year < 2100 and not exists (select 1 from public._delta_keep_tk k where k.tk = t.tk_number) order by 1 limit 15) x",
        "union all select 'phiếu LOADTEST còn lại (không đụng tới)', count(*)::text from public.transport_plans where tk_year >= 2100",
        f"union all select 'phiếu sẽ thêm/cập nhật theo file', '{len(plans)}'",
        f"union all select 'dòng bảng kiểm sẽ thêm/cập nhật theo file', '{len(details)}'",
        f"union all select 'dòng đổi đơn vị giao sang AH*', '{sum(len(v) for v in du.values())}'",
        "union all select 'đã có danh mục Kho An Hạ? (phải = 0)', count(*)::text from public.lookup_items where kind = 'delivery_unit' and lower(name) = lower('Kho An Hạ')",
        "union all select 'có tài khoản bao.lt? (phải = 1)', count(*)::text from public.profiles where username = 'bao.lt';",
    ]

    lk = "public.lookup_items"
    f2 = [
        "-- T-081 bước 2/2: ÁP DỤNG. Chạy SAU delta_01_chuan-bi.sql.",
        "-- SQL Editor của Supabase có thể lưu từng câu ngay khi chạy xong (không giữ cả khối begin/commit),",
        "-- nên MỌI câu ở đây đều chạy lại được an toàn: lỗi giữa chừng thì sửa rồi chạy lại cả delta_01 và delta_02.",
        "set session characteristics as transaction read write;",
        "begin;",
        "do $$ begin",
        "  assert to_regclass('public._delta_keep_tk') is not null and to_regclass('public._delta_p') is not null"
        " and to_regclass('public._delta_d') is not null, 'Chưa chạy delta_01_chuan-bi.sql (bản mới)';",
        "  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'lookup_items' and column_name = 'archived_at'), 'Chưa chạy migration 000021';",
        "  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transport_plans' and column_name = 'require_complete'), 'Chưa chạy migration 000022';",
        "  assert exists (select 1 from public.profiles where username = 'bao.lt'), 'Chưa có tài khoản bao.lt';",
        "end $$;",
        "",
        "-- 1. Xóa dữ liệu tạo thử trên web (người dùng xác nhận 04/11/2026: phiếu web là phiếu thử)",
        "delete from public.inspection_details where import_ref is null;",
        "delete from public.transport_plans t where t.tk_year < 2100",
        "  and not exists (select 1 from public._delta_keep_tk k where k.tk = t.tk_number)",
        "  and not exists (select 1 from public.inspection_details d where d.plan_id = t.id);",
        "delete from public.tk_reservations;",
        "",
        "-- 2. Danh mục: đổi tên 'An Hạ' -> 'Kho An Hạ' (mọi dòng cũ tự theo), thêm mục còn thiếu (đã có — kể cả đã ẩn — thì không thêm)",
        f"update {lk} set name = 'Kho An Hạ' where kind = 'delivery_unit' and name = 'An Hạ'",
        f"  and not exists (select 1 from {lk} x where x.kind = 'delivery_unit' and lower(x.name) = lower('Kho An Hạ'));",
        f"insert into {lk} (kind, name)",
        f"select v.k, v.n from (values\n{values(lk_rows)}\n) v(k, n)",
        "where public._delta_lk(v.k, v.n) is null;",
        "-- người chưa có ở cả hai danh mục NV xuất -> thêm vào đúng danh mục của cột (người xuất hàng ở bảng kiểm -> NV xuất VT)",
        f"insert into {lk} (kind, name)",
        f"select distinct on (lower(v.n)) v.k, v.n from (values\n{values(people)}\n) v(k, n)",
        "where public._delta_person(v.k, v.n) is null order by lower(v.n), v.k;",
        f"insert into {lk} (kind, code, name)",
        f"select 'construction', v.c, v.c from (values\n{values([[c] for c in cons])}\n) v(c)",
        "where public._delta_con(v.c) is null;",
        "",
        f"-- 3. Phiếu: thêm mới hoặc cập nhật theo file ({len(plans)} phiếu, dữ liệu trong _delta_p)",
        "insert into public.transport_plans (tk_number, tk_year, tk_month, tk_seq, export_date, transport_order_no,",
        "  transport_type_id, vehicle_id, driver_id, fg_exporter_id, note, created_at, created_by, require_complete)",
        "select p.tk, p.y::int, p.m::int, p.s::int, p.ed::date, p.ord, public._delta_lk('transport_type', p.tt), public._delta_lk('vehicle', p.ve),",
        "  public._delta_lk('driver', p.dr), public._delta_person('fg_exporter', p.fg), p.note,",
        "  coalesce(p.ed::date::timestamp at time zone 'Asia/Ho_Chi_Minh', now()), (select id from public.profiles where username = 'bao.lt'), false",
        "from public._delta_p p",
        "on conflict (tk_number) do update set export_date = excluded.export_date, transport_order_no = excluded.transport_order_no,",
        "  transport_type_id = excluded.transport_type_id, vehicle_id = excluded.vehicle_id, driver_id = excluded.driver_id,",
        "  fg_exporter_id = excluded.fg_exporter_id, note = excluded.note,",
        "  -- phiếu thử trên web trùng số với file: thành phiếu nạp (người tạo, giờ tạo, không bắt điền đủ)",
        "  created_at = case when transport_plans.require_complete then excluded.created_at else transport_plans.created_at end,",
        "  created_by = case when transport_plans.require_complete then excluded.created_by else transport_plans.created_by end,",
        "  require_complete = false;",
        f"-- NV xuất VT của các phiếu trên: thay bằng danh sách trong file ({len(mx_rows)} lượt)",
        "delete from public.transport_plan_material_exporters m using public.transport_plans t",
        "  where m.plan_id = t.id and t.tk_number in (select tk from public._delta_p);",
        "insert into public.transport_plan_material_exporters (plan_id, lookup_id, sort_order)",
        f"select t.id, public._delta_person('material_exporter', v.n), v.o::int from (values\n{values(mx_rows)}\n) v(tk, n, o)",
        "join public.transport_plans t on t.tk_number = v.tk",
        "where public._delta_person('material_exporter', v.n) is not null",
        "on conflict do nothing;",
        "",
        f"-- 4. Bảng kiểm: thêm mới hoặc cập nhật đủ cột theo file ({len(details)} dòng trong _delta_d; dòng cũ khác không đụng, giữ ngày đã chốt)",
        "insert into public.inspection_details (plan_id, export_date, warehouse_slip_no, construction_id, delivery_unit_id,",
        "  receiving_unit_id, export_type_id, product_id, unit_id, carrier_id, shipper_id, work_item, quantity,",
        "  total_weight_kg, note, import_ref, created_at, created_by, require_complete)",
        "-- shipper_id chỉ ghi khi người xuất hàng KHÁC NV xuất theo phiếu (TP/BTP, rồi NV xuất VT đầu tiên) — như D-010",
        "select p.id, b.ed::date, b.slip, public._delta_con(b.cons), public._delta_lk('delivery_unit', b.du), public._delta_lk('receiving_unit', b.ru),",
        "  public._delta_lk('export_type', b.et), public._delta_lk('product', b.pr), public._delta_lk('unit', b.un), public._delta_lk('carrier', b.ca),",
        "  case when b.sh is not null and lower(b.sh) is distinct from lower(coalesce(fg.name, mx.name)) then public._delta_person('material_exporter', b.sh) end,",
        "  b.item, b.qty::numeric, b.wt::numeric, b.note, b.ref,",
        "  coalesce(b.ed::date::timestamp at time zone 'Asia/Ho_Chi_Minh', now()), (select id from public.profiles where username = 'bao.lt'), false",
        "from public._delta_d b",
        "left join public.transport_plans p on p.tk_number = b.tk",
        f"left join {lk} fg on fg.id = p.fg_exporter_id",
        "left join lateral (select l.name from public.transport_plan_material_exporters m join public.lookup_items l on l.id = m.lookup_id",
        "  where m.plan_id = p.id order by m.sort_order, m.lookup_id limit 1) mx on true",
        "on conflict (import_ref) where import_ref is not null do update set plan_id = excluded.plan_id, export_date = excluded.export_date,",
        "  warehouse_slip_no = excluded.warehouse_slip_no, construction_id = excluded.construction_id, delivery_unit_id = excluded.delivery_unit_id,",
        "  receiving_unit_id = excluded.receiving_unit_id, export_type_id = excluded.export_type_id, product_id = excluded.product_id,",
        "  unit_id = excluded.unit_id, carrier_id = excluded.carrier_id, shipper_id = excluded.shipper_id, work_item = excluded.work_item,",
        "  quantity = excluded.quantity, total_weight_kg = excluded.total_weight_kg, note = excluded.note;",
        "",
        "-- 5. Dòng cũ chỉ đổi Đơn vị giao sang AH*",
    ]
    for name, refs in sorted(du.items()):
        f2.append(f"update public.inspection_details set delivery_unit_id = public._delta_lk('delivery_unit', {q(name)})\n"
                  f"  where import_ref = any(array[{', '.join(q(x) for x in refs)}]);")
    f2 += [
        "",
        "drop table public._delta_keep_tk, public._delta_p, public._delta_d;",
        "drop function public._delta_lk(text, text), public._delta_con(text), public._delta_person(text, text);",
        "commit;",
        "",
        "-- Kiểm sau (đối chiếu với báo cáo của Lead)",
        "select (select count(*) from public.transport_plans where tk_year < 2100) as so_phieu,",
        "  (select count(*) from public.inspection_details where import_ref is not null and import_ref not like 'LOADTEST-%') as so_dong,",
        "  (select sum(total_weight_kg) from public.inspection_details where import_ref is not null and import_ref not like 'LOADTEST-%') as tong_kg,",
        "  (select count(*) from public.inspection_details d join public.lookup_items l on l.id = d.delivery_unit_id where l.name = 'Kho An Hạ') as dong_kho_an_ha;",
    ]
    (CLEAN / "delta_01_chuan-bi.sql").write_text("\n".join(f1) + "\n", encoding="utf-8")
    (CLEAN / "delta_02_ap-dung.sql").write_text("\n".join(f2) + "\n", encoding="utf-8")
    print(f"phiếu upsert {len(plans)} (thêm {sum(1 for r in plans if r['tk_number'] not in {x['tk_number'] for x in p_old})}), "
          f"NV xuất VT {len(mx_rows)} lượt; dòng upsert {len(details)}; đổi ĐV giao {dict((k, len(v)) for k, v in du.items())}; "
          f"danh mục cần có {len(lk_rows)}, người {len(people)}, công trình {len(cons)}; số TK giữ {len(keep)}")
    for name in ("delta_01_chuan-bi.sql", "delta_02_ap-dung.sql"):
        print(f"  {name}: {(CLEAN / name).stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
