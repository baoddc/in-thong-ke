import { formatDateTime, formatShortDateTime } from '../lib/format'

/** Cột kiểm soát của một dòng dữ liệu (D-016): người tạo + người sửa lần cuối (null = chưa sửa). Tên có sẵn trong dòng RPC danh sách (D-017). */
export type Audit = {
  created_by?: string | null; created_at?: string | null; created_by_name?: string | null; created_by_username?: string | null
  updated_by?: string | null; updated_at?: string | null; updated_by_name?: string | null; updated_by_username?: string | null
}

/** Ô bảng gọn 2 dòng: "Tạo: bao.lt · 30/10 14:05" và (nếu có) "Sửa: quoc.lt · 30/10 15:00". Họ tên đầy đủ ở tooltip. */
export function AuditCell({ row }: { row: Audit }) {
  if (!row.created_by && !row.updated_by) return <>—</>
  const line = (label: string, id: string | null | undefined, name: string | null | undefined, username: string | null | undefined, at: string | null | undefined) => {
    if (!id) return null
    return (
      <span className="block" title={username ? `${name ?? username} (${username}) — ${formatDateTime(at)}` : undefined}>
        {label}: <b className="font-medium">{username ?? '—'}</b>{at ? ` · ${formatShortDateTime(at)}` : ''}
      </span>
    )
  }
  return (
    <span className="block whitespace-nowrap text-xs leading-snug text-gray-700" data-testid="audit-cell">
      {line('Tạo', row.created_by, row.created_by_name, row.created_by_username, row.created_at)}
      {line('Sửa', row.updated_by, row.updated_by_name, row.updated_by_username, row.updated_at)}
    </span>
  )
}

/** Dòng thông tin dưới tiêu đề modal Sửa/Xem: "Tạo bởi Lê Thái Bão (bao.lt) lúc …; sửa lần cuối bởi … lúc …". */
export function AuditNote({ row }: { row: Audit }) {
  const who = (name: string | null | undefined, username: string | null | undefined) => (username ? `${name ?? username} (${username})` : '—')
  const parts = [
    row.created_by && `Tạo bởi ${who(row.created_by_name, row.created_by_username)}${row.created_at ? ` lúc ${formatDateTime(row.created_at)}` : ''}`,
    row.updated_by && `sửa lần cuối bởi ${who(row.updated_by_name, row.updated_by_username)}${row.updated_at ? ` lúc ${formatDateTime(row.updated_at)}` : ''}`,
  ].filter(Boolean)
  if (!parts.length) return null
  return <p className="text-xs text-muted" data-testid="audit-note">{parts.join('; ')}</p>
}
