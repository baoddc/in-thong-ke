import { useState } from 'react'
import { formatDateTime } from '../lib/format'
import { ROLE_LABEL, userActions, type Role } from '../lib/auth'
import { callAdmin, messageOf, useAdminUsers, type AdminUser } from '../lib/useAdminUsers'
import { useProfile } from '../lib/useProfile'
import { CreateUserModal, CredentialsDialog, EditUserModal, ResetPasswordModal } from '../components/UserModals'
import Button from '../components/ui/Button'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import DataTable, { type Column } from '../components/ui/DataTable'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import { useToast } from '../components/ui/Toast'

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; user: AdminUser }
  | { kind: 'reset'; user: AdminUser }
  | { kind: 'toggle'; user: AdminUser; busy: boolean }
  | { kind: 'credentials'; title: string; username: string; password: string }

const pill = 'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold'
const ROLE_PILL: Record<Role, string> = { root: 'bg-amber-300 text-slate-900', admin: 'bg-primary-soft text-primary-dark', user: 'bg-stone-200 text-gray-800' }

export default function UsersPage() {
  const toast = useToast()
  const { profile, isRoot } = useProfile()
  const { users, loading, error, reload } = useAdminUsers()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const close = () => setDialog(null)

  async function confirmToggle(user: AdminUser) {
    setDialog({ kind: 'toggle', user, busy: true })
    try {
      await callAdmin({ action: 'set_active', user_id: user.id, active: !user.is_active })
      toast.success(user.is_active ? `Đã khóa ${user.username}` : `Đã mở khóa ${user.username}`)
      void reload()
    } catch (e) {
      toast.error(messageOf(e))
    }
    close()
  }

  const columns: Column<AdminUser>[] = [
    { key: 'name', header: 'Họ tên', render: (u) => u.full_name },
    { key: 'username', header: 'Tên đăng nhập', nowrap: true, render: (u) => u.username },
    { key: 'role', header: 'Vai trò', render: (u) => <span className={`${pill} ${ROLE_PILL[u.role]}`}>{ROLE_LABEL[u.role]}</span> },
    { key: 'status', header: 'Trạng thái', render: (u) => <span className={`${pill} ${u.is_active ? 'bg-green-100 text-green-900' : 'bg-danger-soft text-danger'}`}>{u.is_active ? 'Hoạt động' : 'Đã khóa'}</span> },
    { key: 'last', header: 'Đăng nhập gần nhất', nowrap: true, render: (u) => formatDateTime(u.last_sign_in_at) || 'Chưa đăng nhập' },
    { key: 'created', header: 'Ngày tạo', nowrap: true, render: (u) => formatDateTime(u.created_at) },
    {
      key: 'actions', header: 'Thao tác', nowrap: true,
      render: (u) => {
        const can = userActions(profile, u)
        const toggleHint = can.toggleActive ? undefined : u.role === 'root' ? 'Không thể khóa tài khoản root' : u.id === profile?.id ? 'Bạn không thể tự khóa chính mình' : 'Bạn không có quyền với tài khoản này'
        return (
          <span className="inline-flex gap-1">
            <Button size="sm" disabled={!can.edit} onClick={() => setDialog({ kind: 'edit', user: u })} data-testid={`user-edit-${u.username}`}>Sửa</Button>
            <Button size="sm" disabled={!can.resetPassword} onClick={() => setDialog({ kind: 'reset', user: u })} data-testid={`user-reset-${u.username}`}>Đặt lại mật khẩu</Button>
            <Button size="sm" disabled={!can.toggleActive} title={toggleHint}
              onClick={() => setDialog({ kind: 'toggle', user: u, busy: false })} data-testid={`user-toggle-${u.username}`}>
              {u.is_active ? 'Khóa' : 'Mở khóa'}
            </Button>
          </span>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-3 md:min-h-0 md:flex-1">
      <PageHeader title="Quản lý người dùng" description="Tạo tài khoản, đổi vai trò, khóa/mở khóa, đặt lại mật khẩu">
        <Button variant="primary" size="sm" icon="plus" onClick={() => setDialog({ kind: 'create' })} data-testid="add-user">Thêm người dùng</Button>
      </PageHeader>

      <DataTable columns={columns} rows={users} rowKey={(u) => u.id} rowTestId={(u) => `user-row-${u.username}`}
        loading={loading} error={error} onRetry={() => void reload()} sort="" dir="asc" onSort={() => {}} testId="user-table"
        empty={<EmptyState title="Chưa có người dùng nào." hint="Bấm “Thêm người dùng” để tạo tài khoản đầu tiên." />} />

      {dialog?.kind === 'create' && (
        <CreateUserModal canPickRole={isRoot} onClose={close} onCreated={(u, password) => { void reload(); setDialog({ kind: 'credentials', title: 'Đã tạo tài khoản', username: u.username, password }) }} />
      )}
      {dialog?.kind === 'edit' && (
        <EditUserModal user={dialog.user} showRole={isRoot} canChangeRole={userActions(profile, dialog.user).changeRole} onClose={close}
          onSaved={() => { toast.success(`Đã cập nhật ${dialog.user.username}`); close(); void reload() }} />
      )}
      {dialog?.kind === 'reset' && (
        <ResetPasswordModal user={dialog.user} onClose={close}
          onDone={(password) => setDialog({ kind: 'credentials', title: 'Đã đặt lại mật khẩu', username: dialog.user.username, password })} />
      )}
      {dialog?.kind === 'toggle' && (
        <ConfirmDialog title={dialog.user.is_active ? `Khóa ${dialog.user.username}?` : `Mở khóa ${dialog.user.username}?`} busy={dialog.busy}
          confirmLabel={dialog.user.is_active ? 'Khóa' : 'Mở khóa'}
          message={dialog.user.is_active ? `${dialog.user.full_name} sẽ không đăng nhập và không xem được dữ liệu cho đến khi được mở khóa.` : `${dialog.user.full_name} sẽ đăng nhập lại được.`}
          onConfirm={() => void confirmToggle(dialog.user)} onCancel={close} />
      )}
      {dialog?.kind === 'credentials' && <CredentialsDialog title={dialog.title} username={dialog.username} password={dialog.password} onClose={close} />}
    </div>
  )
}
