// Edge Function sheets-sync: đồng bộ phiếu thống kê / dòng bảng kiểm từ hệ thống sang Google Sheet (một chiều): thêm, sửa, xóa đều cập nhật theo.
// POST {}                              → xử lý hàng đợi sheet_outbox (migration 000035); gọi sau mỗi lần lưu/xóa.
// POST { action:'full_sync', tbl, after } → (admin) đồng bộ lại toàn bộ một bảng theo từng lượt; lượt đầu after=null xóa tab rồi ghi lại.
// Mỗi dòng trong Sheet có cột A = id; sửa/xóa tìm dòng theo id. Chưa cấu hình Google (thiếu secret) → không lấy hàng đợi, trả { configured:false }.
// Secret: GOOGLE_SERVICE_ACCOUNT_JSON (khóa tài khoản dịch vụ, nguyên file JSON), GOOGLE_SHEET_ID,
//         tùy chọn GOOGLE_SHEET_TAB_PLANS (mặc định "Phiếu thống kê"), GOOGLE_SHEET_TAB_DETAILS (mặc định "Bảng kiểm").
import { createClient } from 'npm:@supabase/supabase-js@2'
import { idMap, planChanges, type Row, safe } from './plan.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const BATCH = 200 // mục hàng đợi mỗi lần lấy
const MAX_BATCHES = 5 // một lần gọi xử lý tối đa 1000 mục; phần còn lại ở lần gọi sau
const WRITE_CHUNK = 500 // dòng mỗi yêu cầu ghi
const FULL_PAGE = 1500 // dòng mỗi trang khi đồng bộ lại toàn bộ
const FULL_BUDGET_MS = 80_000 // một lượt full_sync chạy tối đa ~80 giây rồi trả next_after để gọi tiếp
const LOCK_SECONDS = 120

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Token truy cập Google từ khóa tài khoản dịch vụ (JWT RS256, phạm vi Sheets). */
async function accessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))}`
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[A-Z ]+-----|\s/g, '')), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }),
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) throw new Error(`Google từ chối khóa tài khoản dịch vụ: ${body.error_description ?? body.error ?? res.status}`)
  return body.access_token
}

class Sheet {
  constructor(private token: string, private id: string, private tab: string) {}
  private async call(path: string, init?: RequestInit) {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.id}${path}`, {
      ...init, headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`Google Sheets (tab "${this.tab}"): ${body?.error?.message ?? res.status}`)
    return body
  }
  private range = (a1: string) => encodeURIComponent(`'${this.tab}'!${a1}`)
  private cells = (rows: Row[]) => rows.map((r) => r.map(safe))

  async colA(): Promise<unknown[][] | undefined> { return (await this.call(`/values/${this.range('A:A')}`)).values }
  async write(a1: string, rows: Row[]) {
    await this.call(`/values/${this.range(a1)}?valueInputOption=USER_ENTERED`, { method: 'PUT', body: JSON.stringify({ values: this.cells(rows) }) })
  }
  async append(rows: Row[]) {
    for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
      await this.call(`/values/${this.range('A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        method: 'POST', body: JSON.stringify({ values: this.cells(rows.slice(i, i + WRITE_CHUNK)) }),
      })
    }
  }
  async updateRows(items: { row: number; values: Row }[]) {
    for (let i = 0; i < items.length; i += WRITE_CHUNK) {
      await this.call('/values:batchUpdate', {
        method: 'POST',
        body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: items.slice(i, i + WRITE_CHUNK).map((u) => ({ range: `'${this.tab}'!A${u.row}`, values: this.cells([u.values]) })) }),
      })
    }
  }
  async deleteRows(rowsDesc: number[]) {
    if (!rowsDesc.length) return
    const meta = await this.call('?fields=sheets.properties(sheetId,title)')
    const gid = (meta.sheets as { properties: { sheetId: number; title: string } }[]).find((s) => s.properties.title === this.tab)?.properties.sheetId
    if (gid === undefined) throw new Error(`Không thấy tab "${this.tab}" trong file Google Sheet`)
    for (let i = 0; i < rowsDesc.length; i += WRITE_CHUNK) {
      await this.call(':batchUpdate', {
        method: 'POST',
        body: JSON.stringify({ requests: rowsDesc.slice(i, i + WRITE_CHUNK).map((r) => ({ deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: r - 1, endIndex: r } } })) }),
      })
    }
  }
  async clear() { await this.call(`/values/${this.range('A:ZZ')}:clear`, { method: 'POST', body: '{}' }) }
}

type Item = { tbl: string; row_id: number; op: 'upsert' | 'delete' }

async function handle(req: Request): Promise<Response> {
  const url = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'Bạn chưa đăng nhập' }, 401)

  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
  const { data: me, error: meErr } = await caller.auth.getUser()
  if (meErr || !me.user) return json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' }, 401)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: profile } = await admin.from('profiles').select('role, is_active').eq('id', me.user.id).maybeSingle()
  if (!profile?.is_active || profile.role === 'viewer') return json({ error: 'Bạn không có quyền thực hiện thao tác này' }, 403)

  let body: { action?: string; tbl?: string; after?: number | null } = {}
  try { body = await req.json() } catch { /* body rỗng = xử lý hàng đợi */ }
  const full = body.action === 'full_sync'
  if (full && profile.role !== 'admin' && profile.role !== 'root') return json({ error: 'Chỉ admin được đồng bộ lại toàn bộ' }, 403)

  const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  const sheetId = Deno.env.get('GOOGLE_SHEET_ID')
  if (!saJson || !sheetId) return json({ configured: false })
  const tabs: Record<string, string> = {
    transport_plans: Deno.env.get('GOOGLE_SHEET_TAB_PLANS') || 'Phiếu thống kê',
    inspection_details: Deno.env.get('GOOGLE_SHEET_TAB_DETAILS') || 'Bảng kiểm',
  }

  // Lượt full_sync tiếp theo (after != null) giữ/gia hạn khóa đang có; mọi trường hợp khác phải giành được khóa mới.
  const continuing = full && body.after != null
  const { data: got } = await admin.rpc('acquire_sheet_lock', { p_seconds: full ? 300 : LOCK_SECONDS, p_force: continuing })
  if (!got) return json({ configured: true, busy: true })

  let release = true
  try {
    const token = await accessToken(JSON.parse(saJson))
    if (full) {
      const tbl = body.tbl ?? ''
      if (!(tbl in tabs)) return json({ error: 'Bảng không hợp lệ' }, 400)
      const r = await fullSync(admin, new Sheet(token, sheetId, tabs[tbl]), tbl, body.after ?? null)
      release = r.done // chưa xong thì giữ khóa cho lượt kế (hết hạn sau 300 giây nếu bị bỏ dở)
      return json({ configured: true, ...r })
    }
    return json({ configured: true, ...(await drainQueue(admin, token, sheetId, tabs)) })
  } catch (e) {
    console.error(e)
    return json({ error: String((e as Error).message) }, 502)
  } finally {
    if (release) await admin.rpc('release_sheet_lock')
  }
}

type Admin = ReturnType<typeof createClient>

/** Tab trống → ghi tiêu đề; tab có nội dung lạ (ô A1 không phải "ID") → từ chối để không ghi đè dữ liệu của người dùng. */
async function ensureHeader(sheet: Sheet, colA: unknown[][] | undefined, headers: string[]) {
  const a1 = String(colA?.[0]?.[0] ?? '')
  if (a1 === 'ID') return
  if (colA?.some((c) => c?.[0] !== undefined && c[0] !== '')) throw new Error('Tab đã có nội dung khác (ô A1 không phải "ID"). Hãy dùng tab trống hoặc xóa nội dung tab đó.')
  await sheet.write('A1', [headers])
}

async function drainQueue(admin: Admin, token: string, sheetId: string, tabs: Record<string, string>) {
  let processed = 0
  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data: claimed, error: cErr } = await admin.rpc('claim_sheet_rows', { p_limit: BATCH })
    if (cErr) throw new Error('Không đọc được hàng đợi')
    const items = (claimed ?? []) as Item[]
    if (!items.length) break
    const done = new Set<string>()
    try {
      for (const tbl of new Set(items.map((x) => x.tbl))) {
        const mine = items.filter((x) => x.tbl === tbl)
        const upsert = mine.filter((x) => x.op === 'upsert').map((x) => Number(x.row_id))
        const del = mine.filter((x) => x.op === 'delete').map((x) => Number(x.row_id))
        const sheet = new Sheet(token, sheetId, tabs[tbl])
        const { data: payload, error: pErr } = await admin.rpc('sheet_payload', { p_tbl: tbl, p_ids: upsert })
        if (pErr) throw new Error(pErr.message)
        const colA = await sheet.colA()
        await ensureHeader(sheet, colA, (payload as { headers: string[] }).headers)
        const rowOf = idMap(colA)
        const plan = planChanges(rowOf, (payload as { rows: Row[] }).rows, upsert, del)
        await sheet.updateRows(plan.updates)
        await sheet.append(plan.appends)
        await sheet.deleteRows(plan.deleteRows)
        done.add(tbl)
        processed += mine.length
      }
    } catch (e) {
      // trả lại phần chưa xử lý xong của lô để lần sau thử lại (làm lại một thao tác đã xong cũng không gây trùng vì tìm theo id)
      const rest = items.filter((x) => !done.has(x.tbl))
      await admin.rpc('release_sheet_rows', { p_items: rest })
      throw e
    }
    if (items.length < BATCH) break
  }
  return { processed }
}

async function fullSync(admin: Admin, sheet: Sheet, tbl: string, after: number | null) {
  const started = Date.now()
  let cursor = after ?? 0
  let written = 0
  if (after == null) {
    const { data: head, error } = await admin.rpc('sheet_payload', { p_tbl: tbl, p_ids: [] })
    if (error) throw new Error(error.message)
    await sheet.clear()
    await sheet.write('A1', [(head as { headers: string[] }).headers])
  }
  while (Date.now() - started < FULL_BUDGET_MS) {
    const { data: ids, error: iErr } = await admin.rpc('sheet_ids_after', { p_tbl: tbl, p_after: cursor, p_limit: FULL_PAGE })
    if (iErr) throw new Error(iErr.message)
    const list = (ids ?? []) as number[]
    if (!list.length) return { done: true, next_after: cursor, written }
    const { data: payload, error: pErr } = await admin.rpc('sheet_payload', { p_tbl: tbl, p_ids: list })
    if (pErr) throw new Error(pErr.message)
    await sheet.append((payload as { rows: Row[] }).rows)
    written += list.length
    cursor = Number(list[list.length - 1])
  }
  return { done: false, next_after: cursor, written }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Chỉ hỗ trợ phương thức POST' }, 405)
  try {
    return await handle(req)
  } catch (e) {
    console.error(e)
    return json({ error: 'Lỗi máy chủ, vui lòng thử lại' }, 500)
  }
})
