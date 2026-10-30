import { useEffect } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { useToast } from '../components/ui/Toast'
import { notifyEditRequestsChanged, targetLabel, untilLabel } from './useEditRequests'

type Toast = ReturnType<typeof useToast>
type Changed = { id: number; requested_by: string; status: string; decision_note: string | null; unlock_until: string | null }

/** Nhãn đối tượng của yêu cầu (payload không có số phiếu → truy vấn lại đúng 1 dòng); lỗi thì dùng nhãn chung. */
async function labelOf(id: number): Promise<string> {
  try {
    const { data } = await supabase.from('edit_requests').select('plan:transport_plans(tk_number), detail:inspection_details(tk_number, warehouse_slip_no)').eq('id', id).maybeSingle()
    // shortcut: embed detail chưa có trong database.ts (migration 000015) → ép kiểu
    return data ? targetLabel(data as unknown as Parameters<typeof targetLabel>[0]) : 'của bạn'
  } catch { return 'của bạn' }
}

async function announce(p: RealtimePostgresChangesPayload<Record<string, unknown>>, userId: string, toast: Toast) {
  const n = p.new as Partial<Changed>
  if (p.eventType === 'INSERT') { if (n.requested_by !== userId) toast.success('Có yêu cầu sửa mới đang chờ duyệt'); return }
  if (p.eventType !== 'UPDATE' || n.requested_by !== userId || !n.id) return // admin chỉ báo toast cho yêu cầu của chính mình
  if (n.status === 'approved') toast.success(`Yêu cầu sửa ${await labelOf(n.id)} đã được duyệt, sửa được đến ${untilLabel(n.unlock_until)}`)
  else if (n.status === 'rejected') toast.error(`Yêu cầu sửa ${await labelOf(n.id)} bị từ chối${n.decision_note ? `: ${n.decision_note}` : ''}`) // lỗi không tự ẩn → người dùng kịp đọc lý do
}

/**
 * D-020: nghe thay đổi edit_requests qua Realtime (RLS vẫn áp dụng). User: chỉ UPDATE yêu cầu của mình;
 * admin/root: mọi thay đổi. Mỗi thay đổi phát sự kiện để badge, danh sách và nút Sửa tự tải lại; duyệt/từ chối hiện toast ngay.
 * Chưa bù sự kiện lỡ khi mất kết nối — mở lại trang là thấy trạng thái đúng.
 */
export function useEditRequestNotices(userId: string | undefined, isAdmin: boolean) {
  const toast = useToast()
  useEffect(() => {
    if (!userId) return
    const ch = supabase.channel(`edit-requests-${userId}`)
    const onChange = (p: RealtimePostgresChangesPayload<Record<string, unknown>>) => { notifyEditRequestsChanged(); void announce(p, userId, toast) }
    const base = { schema: 'public', table: 'edit_requests' } as const
    if (isAdmin) ch.on('postgres_changes', { event: '*', ...base }, onChange)
    else ch.on('postgres_changes', { event: 'UPDATE', ...base, filter: `requested_by=eq.${userId}` }, onChange)
    ch.subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [userId, isAdmin, toast])
}
