// Edge Function register (D-015): tự đăng ký, CÔNG KHAI (deploy verify_jwt=false). Tài khoản tạo ra ở trạng thái Chờ duyệt:
// bị ban trong Auth + profile is_active=false, is_pending=true; admin/root duyệt qua admin-users (approve/reject).
// POST JSON { full_name, password, website? }. website = honeypot (người thật không thấy/không điền).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { INTERNAL_EMAIL_DOMAIN, makeUsername, nextFreeUsername } from './username.ts'

const MAX_PENDING = 20 // chống spam tối thiểu: số yêu cầu chờ duyệt cùng lúc

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const fail = (error: string, status = 400) => json({ error }, status)

async function handle(req: Request): Promise<Response> {
  let body: { full_name?: unknown; password?: unknown; website?: unknown }
  try { body = await req.json() } catch { return fail('Dữ liệu gửi lên không hợp lệ') }

  const fullName = (typeof body.full_name === 'string' ? body.full_name : '').trim().replace(/\s+/g, ' ')
  const base = makeUsername(fullName)
  if (!fullName || !base) return fail('Vui lòng nhập họ tên')
  if (fullName.length > 100) return fail('Họ tên tối đa 100 ký tự')
  const pw = body.password
  // 6 = mức tối thiểu thấp nhất Supabase Auth cho phép (giống admin-users)
  if (typeof pw !== 'string' || pw.length < 6) return fail('Mật khẩu phải có ít nhất 6 ký tự')
  if (pw.length > 72) return fail('Mật khẩu tối đa 72 ký tự')

  // Bot điền ô ẩn: trả thành công giả, không tạo gì.
  if (typeof body.website === 'string' && body.website.trim() !== '') return json({ username: base, full_name: fullName })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { count, error: cntErr } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_pending', true)
  if (cntErr) throw cntErr
  if ((count ?? 0) >= MAX_PENDING) return fail('Đang có nhiều yêu cầu chờ duyệt, vui lòng liên hệ quản trị viên', 429)

  const { data: rows, error: tErr } = await admin.from('profiles').select('username').ilike('username', `${base}%`)
  if (tErr) throw tErr
  const taken = rows.map((r: { username: string }) => r.username)

  for (let attempt = 0; attempt < 5; attempt++) {
    const username = nextFreeUsername(base, taken)
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: `${username}@${INTERNAL_EMAIL_DOMAIN}`,
      password: pw,
      email_confirm: true,
      ban_duration: '876000h', // chưa đăng nhập được tới khi được duyệt
      user_metadata: { full_name: fullName },
    })
    if (cErr || !created.user) {
      if (cErr?.code === 'email_exists' || /already|registered/i.test(cErr?.message ?? '')) { taken.push(username); continue }
      console.error(cErr)
      return fail('Không tạo được tài khoản, vui lòng thử lại', 500)
    }
    const { error: pErr } = await admin.from('profiles')
      .insert({ id: created.user.id, username, full_name: fullName, role: 'user', is_active: false, is_pending: true })
    if (!pErr) return json({ username, full_name: fullName }, 201)
    await admin.auth.admin.deleteUser(created.user.id) // không để tài khoản mồ côi
    if (pErr.code === '23505') { taken.push(username); continue } // đua tên đăng nhập: thử số kế
    console.error(pErr)
    return fail('Không tạo được hồ sơ người dùng, vui lòng thử lại', 500)
  }
  return fail('Không cấp được tên đăng nhập, vui lòng thử lại', 409)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return fail('Chỉ hỗ trợ phương thức POST', 405)
  try {
    return await handle(req)
  } catch (e) {
    console.error(e)
    return fail('Lỗi máy chủ, vui lòng thử lại', 500)
  }
})
