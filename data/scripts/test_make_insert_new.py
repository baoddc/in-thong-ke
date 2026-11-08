"""Kiểm tra phần tự nạp (không gọi Supabase thật). Chạy: python -X utf8 data/scripts/test_make_insert_new.py"""
import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_insert_new as m  # noqa: E402

# --- read_token: biến môi trường > file .env; thiếu thì rỗng + mã dự án mặc định
os.environ.pop("SUPABASE_ACCESS_TOKEN", None)
os.environ.pop("SUPABASE_PROJECT_REF", None)
env = Path(m.__file__).resolve().parent / ".env"
saved = env.read_text(encoding="utf-8") if env.exists() else None
try:
    env.write_text("# ghi chú\nSUPABASE_ACCESS_TOKEN=sbp_abc\n", encoding="utf-8")
    assert m.read_token() == ("sbp_abc", m.PROJECT_REF)
    env.write_text("SUPABASE_ACCESS_TOKEN=\n", encoding="utf-8")
    assert m.read_token() == ("", m.PROJECT_REF)
    os.environ["SUPABASE_ACCESS_TOKEN"] = "sbp_env"
    assert m.read_token()[0] == "sbp_env"
finally:
    os.environ.pop("SUPABASE_ACCESS_TOKEN", None)
    if saved is None:
        env.unlink(missing_ok=True)
    else:
        env.write_text(saved, encoding="utf-8")

# --- run_sql: gửi đúng địa chỉ/khóa/câu lệnh; lỗi 4xx -> RuntimeError có nội dung
calls = []
class Resp:
    def __init__(self, ok, status, body): self.ok, self.status_code, self._b, self.text = ok, status, body, str(body)
    def json(self): return self._b
import requests  # noqa: E402
orig = requests.post
try:
    requests.post = lambda url, headers=None, json=None, timeout=None: (calls.append((url, headers, json)) or Resp(True, 201, [{"x": 1}]))
    assert m.run_sql("select 1", "tok", "ref123") == [{"x": 1}]
    assert calls[0][0] == "https://api.supabase.com/v1/projects/ref123/database/query" and calls[0][1]["Authorization"] == "Bearer tok" and calls[0][2] == {"query": "select 1"}
    requests.post = lambda *a, **k: Resp(False, 401, "Unauthorized")
    try:
        m.run_sql("select 1", "tok", "ref123")
        raise SystemExit("phải báo lỗi")
    except RuntimeError as e:
        assert "401" in str(e)

    # --- push: không có chìa khóa -> mã thoát 3; có --yes -> chạy SQL thật 2 lần (kết nối + nạp) và kiểm số lượng
    m.read_token = lambda: ("", "ref")
    try:
        m.push("select 1", [], [], True)
        raise SystemExit("phải thoát mã 3")
    except SystemExit as e:
        assert e.code == m.EXIT_NO_TOKEN
    sent = []
    m.read_token = lambda: ("tok", "ref")
    def fake(url, headers=None, json=None, timeout=None):
        sent.append(json["query"])
        return Resp(True, 201, [{"nguoi_dung": "postgres", "tong_phieu": 5}] if len(sent) == 1 else [{"phieu_moi_tren_db": 2, "dong_moi_tren_db": 1, "tong_phieu": 7, "tong_dong_da_nap": 9}])
    requests.post = fake
    m.push("insert ...", [{"tk_number": "TK1"}, {"tk_number": "TK2"}], [{}], True)
    assert len(sent) == 2 and sent[1] == "insert ..."
    # không --yes và không có bàn phím (khi chạy test) -> thoát mã 2, KHÔNG nạp
    sent.clear()
    sys.stdin = None
    try:
        m.push("insert ...", [{"tk_number": "TK1"}], [], False)
        raise SystemExit("phải thoát mã 2")
    except SystemExit as e:
        assert e.code == 2 and len(sent) == 1  # chỉ câu kiểm tra kết nối, chưa nạp
finally:
    requests.post = orig
print("OK")
