import { supabase } from './supabase'
import { sanitizeTerm, type ListParams } from './listQuery'

// shortcut: ép kiểu rpc vì src/types/database.ts (backend sinh) chưa có các hàm list_*/count_* (D-017, D-021); bỏ ép kiểu khi đã sinh lại.
type RpcClient = { rpc: (fn: string, args: object) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> }

// Bộ lọc dùng chung cho RPC dữ liệu và RPC đếm để hai bên không lệch nhau.
const filterArgs = (p: ListParams, extra: Record<string, number | null>) => ({
  p_q: sanitizeTerm(p.q) || null, p_from: p.from || null, p_to: p.to || null, ...extra,
})

/** Gọi RPC danh sách (D-017): `extra` là các tham số lọc theo id riêng của từng bảng. */
export function rpcList(fn: 'list_transport_plans' | 'list_inspection_details', p: ListParams, extra: Record<string, number | null> = {}) {
  return (supabase as unknown as RpcClient).rpc(fn, {
    ...filterArgs(p, extra),
    p_sort: p.sort,
    p_desc: p.dir === 'desc',
    p_limit: p.size,
    p_offset: (p.page - 1) * p.size,
  })
}

/** Đếm tổng dòng khớp bộ lọc (D-021). Lỗi → null để trang vẫn hiện dữ liệu, chỉ thiếu tổng. */
export async function rpcCount(fn: 'count_transport_plans' | 'count_inspection_details', p: ListParams, extra: Record<string, number | null> = {}): Promise<number | null> {
  const { data, error } = await (supabase as unknown as RpcClient).rpc(fn, filterArgs(p, extra))
  const n = Number(data) // bigint có thể về dạng số hoặc chuỗi
  return error || data == null || !Number.isFinite(n) ? null : n
}

export const idOrNull = (v: string) => (v ? Number(v) : null)
