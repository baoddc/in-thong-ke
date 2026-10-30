import { supabase } from './supabase'
import { sanitizeTerm, type ListParams } from './listQuery'

// shortcut: ép kiểu rpc vì src/types/database.ts (backend sinh) chưa có 2 hàm này (D-017); bỏ ép kiểu khi đã sinh lại.
type RpcClient = { rpc: (fn: string, args: object) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> }

/** Gọi RPC danh sách (D-017): `extra` là các tham số lọc theo id riêng của từng bảng. */
export function rpcList(fn: 'list_transport_plans' | 'list_inspection_details', p: ListParams, extra: Record<string, number | null> = {}) {
  return (supabase as unknown as RpcClient).rpc(fn, {
    p_q: sanitizeTerm(p.q) || null, // cùng cách làm sạch với request đếm để hai bên không lệch nhau
    p_from: p.from || null,
    p_to: p.to || null,
    ...extra,
    p_sort: p.sort,
    p_desc: p.dir === 'desc',
    p_limit: p.size,
    p_offset: (p.page - 1) * p.size,
  })
}

export const idOrNull = (v: string) => (v ? Number(v) : null)
