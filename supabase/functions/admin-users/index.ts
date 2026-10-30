// Edge Function admin-users (D-013, D-014): quản lý người dùng, chỉ admin/root đang hoạt động được gọi; quyền chi tiết ở permissions.ts.
// POST JSON { action, ... }; action: list | preview_username | create | update | set_active | reset_password | approve | reject (D-015).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { type Action, canManage, isRole, type Role, type Target } from './permissions.ts'
import { INTERNAL_EMAIL_DOMAIN, makeUsername, nextFreeUsername } from './username.ts'

type Profile = { id: string; username: string; full_name: string; role: Role; is_active: boolean; is_pending: boolean; created_by: string | null; approved_by: string | null; approved_at: string | null; created_at: string }
type Body = { action?: string; full_name?: unknown; password?: unknown; role?: unknown; user_id?: unknown; active?: unknown }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const fail = (error: string, status = 400) => json({ error }, status)

const PROFILE_COLS = 'id, username, full_name, role, is_active, is_pending, created_by, approved_by, approved_at, created_at'
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const checkPassword = (v: unknown) =>
  // 6 = mức tối thiểu thấp nhất Supabase Auth cho phép (người dùng muốn không giới hạn, D-013)
  typeof v !== 'string' || v.length < 6 ? 'Mật khẩu phải có ít nhất 6 ký tự' : v.length > 72 ? 'Mật khẩu tối đa 72 ký tự' : null

// shortcut: chỉ ~vài chục tài khoản; list gom hết profiles + auth users, nâng cấp phân trang phía server nếu >> 1000 người.
async function listAll(admin: SupabaseClient) {
  const users: { id: string; email?: string; last_sign_in_at?: string }[] = []
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 1000) break
  }
  const profiles: Profile[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('profiles').select(PROFILE_COLS).order('created_at').range(from, from + 999)
    if (error) throw error
    profiles.push(...(data as Profile[]))
    if (data.length < 1000) break
  }
  const byId = new Map(users.map((u) => [u.id, u]))
  const nameOf = new Map(profiles.map((p) => [p.id, p.full_name]))
  return profiles.map((p) => ({
    ...p,
    created_by_name: (p.created_by && nameOf.get(p.created_by)) || null,
    approved_by_name: (p.approved_by && nameOf.get(p.approved_by)) || null,
    email: byId.get(p.id)?.email ?? null,
    last_sign_in_at: byId.get(p.id)?.last_sign_in_at ?? null,
  }))
}

async function takenUsernames(admin: SupabaseClient, base: string) {
  const { data, error } = await admin.from('profiles').select('username').ilike('username', `${base}%`)
  if (error) throw error
  return data.map((r: { username: string }) => r.username)
}

async function handle(req: Request): Promise<Response> {
  const url = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return fail('Bạn chưa đăng nhập', 401)

  // 1. Xác thực người gọi
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
  const { data: me, error: meErr } = await caller.auth.getUser()
  if (meErr || !me.user) return fail('Phiên đăng nhập không hợp lệ hoặc đã hết hạn', 401)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: myProfile } = await admin.from('profiles').select('role, is_active').eq('id', me.user.id).maybeSingle()
  if (!myProfile || !isRole(myProfile.role) || myProfile.role === 'user' || !myProfile.is_active) {
    return fail('Chỉ quản trị viên mới được quản lý người dùng', 403)
  }
  const myRole: Role = myProfile.role
  const myId = me.user.id
  const deny = (target: Target, action: Action, newRole?: Role) => {
    const msg = canManage(myRole, myId, target, action, newRole)
    return msg ? fail(msg, 403) : null
  }
  // Tải profile đích rồi kiểm quyền; trả Response nếu lỗi.
  const loadTarget = async (id: string, action: Action, newRole?: Role): Promise<{ err: Response | null; target?: Profile }> => {
    const { data } = await admin.from('profiles').select(PROFILE_COLS).eq('id', id).maybeSingle()
    if (!data) return { err: fail('Không tìm thấy người dùng', 404) }
    const target = data as Profile
    return { target, err: deny({ id: target.id, role: target.role, pending: target.is_pending }, action, newRole) }
  }

  let body: Body
  try { body = await req.json() } catch { return fail('Dữ liệu gửi lên không hợp lệ') }

  switch (body.action) {
    case 'list':
      return json((await listAll(admin)).filter((p) => canManage(myRole, myId, p, 'view') === null))

    case 'preview_username': {
      const base = makeUsername(str(body.full_name))
      if (!base) return fail('Họ tên không hợp lệ')
      return json({ username: nextFreeUsername(base, await takenUsernames(admin, base)) })
    }

    case 'create': {
      const fullName = str(body.full_name).replace(/\s+/g, ' ')
      const role = body.role === undefined ? 'user' : body.role
      const base = makeUsername(fullName)
      if (!fullName || !base) return fail('Vui lòng nhập họ tên')
      if (fullName.length > 100) return fail('Họ tên tối đa 100 ký tự')
      if (!isRole(role)) return fail('Vai trò không hợp lệ')
      const denied = deny({ id: null, role }, 'create')
      if (denied) return denied
      const pwErr = checkPassword(body.password)
      if (pwErr) return fail(pwErr)

      const taken = await takenUsernames(admin, base)
      for (let attempt = 0; attempt < 5; attempt++) {
        const username = nextFreeUsername(base, taken)
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email: `${username}@${INTERNAL_EMAIL_DOMAIN}`,
          password: body.password as string,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        })
        if (cErr || !created.user) {
          if (cErr?.code === 'email_exists' || /already|registered/i.test(cErr?.message ?? '')) { taken.push(username); continue }
          return fail(`Không tạo được tài khoản: ${cErr?.message ?? 'lỗi không rõ'}`, 500)
        }
        const { data: profile, error: pErr } = await admin.from('profiles')
          .insert({ id: created.user.id, username, full_name: fullName, role, created_by: myId, approved_by: myId, approved_at: new Date().toISOString() })
          .select(PROFILE_COLS).single()
        if (!pErr) {
          return json({ ...profile, email: created.user.email ?? null, last_sign_in_at: null }, 201)
        }
        await admin.auth.admin.deleteUser(created.user.id) // không để tài khoản mồ côi
        if (pErr.code === '23505') { taken.push(username); continue } // đua tên đăng nhập: thử số kế
        return fail(`Không tạo được hồ sơ người dùng: ${pErr.message}`, 500)
      }
      return fail('Không cấp được tên đăng nhập, vui lòng thử lại', 409)
    }

    case 'update': {
      const id = str(body.user_id)
      if (!id) return fail('Thiếu mã người dùng')
      const patch: Partial<Pick<Profile, 'full_name' | 'role'>> = {}
      if (body.full_name !== undefined) {
        const n = str(body.full_name).replace(/\s+/g, ' ')
        if (!n || n.length > 100) return fail('Họ tên không hợp lệ')
        patch.full_name = n
      }
      if (body.role !== undefined) {
        if (!isRole(body.role)) return fail('Vai trò không hợp lệ')
        patch.role = body.role
      }
      if (!Object.keys(patch).length) return fail('Không có gì để cập nhật')
      const t = await loadTarget(id, patch.full_name !== undefined ? 'rename' : 'change_role', patch.role)
      if (t.err) return t.err
      if (patch.full_name !== undefined && patch.role !== undefined) {
        const e = deny({ id: t.target!.id, role: t.target!.role }, 'change_role', patch.role)
        if (e) return e
      }
      const { data, error } = await admin.from('profiles').update(patch).eq('id', id).select(PROFILE_COLS).single()
      if (error) return fail(`Không cập nhật được: ${error.message}`, 500)
      return json(data)
    }

    case 'set_active': {
      const id = str(body.user_id)
      if (!id) return fail('Thiếu mã người dùng')
      if (typeof body.active !== 'boolean') return fail('Thiếu trạng thái khóa/mở khóa')
      const t = await loadTarget(id, 'set_active')
      if (t.err) return t.err
      // Khóa: profile trước (RLS chặn ngay) rồi ban đăng nhập. Mở: gỡ ban trước rồi mới bật profile.
      if (!body.active) {
        const { error } = await admin.from('profiles').update({ is_active: false }).eq('id', id)
        if (error) return fail(`Không cập nhật được: ${error.message}`, 500)
      }
      const { error: bErr } = await admin.auth.admin.updateUserById(id, { ban_duration: body.active ? 'none' : '876000h' })
      if (bErr) return fail(`Không đổi được trạng thái đăng nhập: ${bErr.message}`, 500)
      if (body.active) {
        const { error } = await admin.from('profiles').update({ is_active: true }).eq('id', id)
        if (error) return fail(`Không cập nhật được: ${error.message}`, 500)
      }
      const { data } = await admin.from('profiles').select(PROFILE_COLS).eq('id', id).single()
      return json(data)
    }

    case 'approve': {
      const id = str(body.user_id)
      if (!id) return fail('Thiếu mã người dùng')
      const t = await loadTarget(id, 'approve')
      if (t.err) return t.err
      // Gỡ ban trước rồi mới bật profile (lỗi giữa chừng: profile vẫn pending, RLS chặn, bấm Duyệt lại được).
      const { error: bErr } = await admin.auth.admin.updateUserById(id, { ban_duration: 'none' })
      if (bErr) return fail(`Không đổi được trạng thái đăng nhập: ${bErr.message}`, 500)
      const { data, error } = await admin.from('profiles').update({ is_active: true, is_pending: false, approved_by: myId, approved_at: new Date().toISOString() })
        .eq('id', id).eq('is_pending', true).select(PROFILE_COLS).single()
      if (error) return fail(`Không cập nhật được: ${error.message}`, 500)
      return json(data)
    }

    case 'reject': {
      const id = str(body.user_id)
      if (!id) return fail('Thiếu mã người dùng')
      const t = await loadTarget(id, 'reject')
      if (t.err) return t.err
      const { error } = await admin.auth.admin.deleteUser(id) // profile xóa theo (cascade)
      if (error) return fail(`Không xóa được tài khoản: ${error.message}`, error.status === 404 ? 404 : 500)
      return json({ ok: true })
    }

    case 'reset_password': {
      const id = str(body.user_id)
      if (!id) return fail('Thiếu mã người dùng')
      const pwErr = checkPassword(body.password)
      if (pwErr) return fail(pwErr)
      const t = await loadTarget(id, 'reset_password')
      if (t.err) return t.err
      const { error } = await admin.auth.admin.updateUserById(id, { password: body.password as string })
      if (error) return fail(`Không đặt lại được mật khẩu: ${error.message}`, error.status === 404 ? 404 : 500)
      return json({ ok: true })
    }

    default:
      return fail('Hành động không hợp lệ')
  }
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
