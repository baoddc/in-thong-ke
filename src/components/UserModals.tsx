import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { MAX_PASSWORD, MIN_PASSWORD, ROLE_LABEL, randomPassword, type Role } from '../lib/auth'
import { callAdmin, messageOf, type AdminUser } from '../lib/useAdminUsers'
import Button from './ui/Button'
import Icon from './ui/Icon'
import { Field, Input, Select } from './ui/Input'
import { useToast } from './ui/Toast'

/** Khung hộp thoại gọn: chỉ mount khi mở (đóng = unmount, form tự reset). */
export function Shell({ title, onClose, busy, testId, footer, children, onSubmit }: {
  title: string; onClose: () => void; busy?: boolean; testId: string; footer: ReactNode; children: ReactNode; onSubmit?: (e: FormEvent) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return (
    <dialog ref={ref} data-testid={testId} aria-labelledby={`${testId}-title`} onCancel={(e) => { e.preventDefault(); if (!busy) onClose() }}
      className="w-[calc(100%-1.5rem)] max-w-md overflow-hidden rounded-2xl border-t-4 border-primary-brand p-0 shadow-2xl backdrop:bg-slate-900/60">
      <form onSubmit={onSubmit ?? ((e) => e.preventDefault())} noValidate className="flex max-h-[90dvh] flex-col">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <h2 id={`${testId}-title`} className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={() => !busy && onClose()} aria-label="Đóng" className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 transition-colors duration-150 hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Icon name="close" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-stone-200 bg-surface px-4 py-3">{footer}</div>
      </form>
    </dialog>
  )
}

const ErrorBox = ({ message, testId }: { message: string; testId: string }) =>
  message ? <p role="alert" className="rounded-card border border-danger-line bg-danger-soft p-2 text-danger" data-testid={testId}>{message}</p> : null

function validatePassword(p: string): string {
  if (p.length < MIN_PASSWORD) return `Mật khẩu phải có ít nhất ${MIN_PASSWORD} ký tự.`
  if (p.length > MAX_PASSWORD) return `Mật khẩu không quá ${MAX_PASSWORD} ký tự.`
  return ''
}

function PasswordField({ value, onChange, error, testId }: { value: string; onChange: (v: string) => void; error?: string; testId: string }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <Field label="Mật khẩu" error={error} hint={`Ít nhất ${MIN_PASSWORD} ký tự`}>
        <Input type={show ? 'text' : 'password'} autoComplete="new-password" value={value} aria-invalid={!!error}
          onChange={(e) => onChange(e.target.value)} data-testid={`${testId}-password`} />
      </Field>
      <div className="mt-1 flex gap-2">
        <Button size="sm" onClick={() => setShow((s) => !s)} aria-pressed={show} data-testid={`${testId}-toggle`}>{show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}</Button>
        <Button size="sm" onClick={() => { onChange(randomPassword(10)); setShow(true) }} data-testid={`${testId}-random`}>Tạo ngẫu nhiên</Button>
      </div>
    </div>
  )
}

/** Hiện tên đăng nhập + mật khẩu vừa cấp để admin chép đưa người dùng (mật khẩu không xem lại được). */
export function CredentialsDialog({ title, username, password, onClose }: { title: string; username: string; password: string; onClose: () => void }) {
  const toast = useToast()
  async function copy() {
    try {
      await navigator.clipboard.writeText(`Tên đăng nhập: ${username}\nMật khẩu: ${password}`)
      toast.success('Đã sao chép')
    } catch {
      toast.error('Không sao chép được. Hãy chép thủ công.')
    }
  }
  return (
    <Shell title={title} onClose={onClose} testId="credentials-dialog"
      footer={<><Button onClick={() => void copy()} data-testid="credentials-copy">Sao chép</Button><Button variant="primary" onClick={onClose} data-testid="credentials-close">Xong</Button></>}>
      <p className="text-gray-700">Hãy chép và gửi cho người dùng. Mật khẩu sẽ không hiển thị lại sau khi đóng.</p>
      <dl className="space-y-2 rounded-card border border-stone-200 bg-stone-50 p-3">
        <div><dt className="text-sm text-muted">Tên đăng nhập</dt><dd className="select-all break-all text-lg font-bold" data-testid="credentials-username">{username}</dd></div>
        <div><dt className="text-sm text-muted">Mật khẩu</dt><dd className="select-all break-all font-mono text-lg font-bold" data-testid="credentials-password">{password}</dd></div>
      </dl>
    </Shell>
  )
}

export function CreateUserModal({ canPickRole, onClose, onCreated }: { canPickRole: boolean; onClose: () => void; onCreated: (user: AdminUser, password: string) => void }) {
  const toast = useToast()
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('user')
  const [errors, setErrors] = useState<{ name?: string; password?: string }>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ forName: string; username: string; error: string } | null>(null)
  const name = fullName.trim()

  // Gõ xong 400ms mới hỏi tên đăng nhập sẽ được cấp (chưa tạo gì).
  useEffect(() => {
    if (!name) return
    let alive = true
    const t = setTimeout(() => {
      callAdmin<{ username: string }>({ action: 'preview_username', full_name: name }).then(
        (r) => { if (alive) setPreview({ forName: name, username: r.username, error: '' }) },
        (e) => { if (alive) setPreview({ forName: name, username: '', error: messageOf(e) }) },
      )
    }, 400)
    return () => { alive = false; clearTimeout(t) }
  }, [name])
  const shown = preview && preview.forName === name ? preview : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const next = { name: name ? undefined : 'Vui lòng nhập họ tên.', password: validatePassword(password) || undefined }
    setErrors(next)
    if (next.name || next.password) return
    setBusy(true)
    setError('')
    try {
      const user = await callAdmin<AdminUser>({ action: 'create', full_name: name, password, role })
      onCreated(user, password)
    } catch (err) {
      setError(messageOf(err))
      toast.error(messageOf(err))
      setBusy(false)
    }
  }

  return (
    <Shell title="Thêm người dùng" onClose={onClose} busy={busy} testId="user-create-modal" onSubmit={submit}
      footer={<><Button onClick={onClose} disabled={busy} data-testid="user-create-cancel">Hủy</Button><Button type="submit" variant="primary" disabled={busy} data-testid="user-create-submit">{busy ? 'Đang tạo...' : 'Tạo tài khoản'}</Button></>}>
      <div>
        <Field label="Họ tên" error={errors.name}>
          <Input autoFocus autoComplete="off" value={fullName} aria-invalid={!!errors.name} onChange={(e) => setFullName(e.target.value)} data-testid="user-fullname" />
        </Field>
        {shown?.username && <p className="mt-1 text-sm text-gray-700" data-testid="username-preview">Tên đăng nhập sẽ là: <b>{shown.username}</b></p>}
        {shown?.error && <p className="mt-1 text-sm text-danger" role="alert" data-testid="username-preview-error">{shown.error}</p>}
      </div>
      <PasswordField value={password} onChange={setPassword} error={errors.password} testId="user-create" />
      {canPickRole && ( // chỉ root chọn vai trò; admin luôn tạo 'user' (D-014)
        <Field label="Vai trò">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)} data-testid="user-role-select">
            <option value="user">{ROLE_LABEL.user}</option>
            <option value="admin">{ROLE_LABEL.admin}</option>
          </Select>
        </Field>
      )}
      <ErrorBox message={error} testId="user-create-error" />
    </Shell>
  )
}

export function EditUserModal({ user, showRole, canChangeRole, onClose, onSaved }: { user: AdminUser; showRole: boolean; canChangeRole: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [fullName, setFullName] = useState(user.full_name)
  const [role, setRole] = useState<Role>(user.role)
  const [nameError, setNameError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const name = fullName.trim()
    if (!name) return setNameError('Vui lòng nhập họ tên.')
    setNameError('')
    const patch = { ...(name !== user.full_name && { full_name: name }), ...(role !== user.role && { role }) }
    if (!Object.keys(patch).length) return onClose()
    setBusy(true)
    setError('')
    try {
      await callAdmin({ action: 'update', user_id: user.id, ...patch })
      onSaved()
    } catch (err) {
      setError(messageOf(err))
      toast.error(messageOf(err))
      setBusy(false)
    }
  }

  return (
    <Shell title={`Sửa ${user.username}`} onClose={onClose} busy={busy} testId="user-edit-modal" onSubmit={submit}
      footer={<><Button onClick={onClose} disabled={busy} data-testid="user-edit-cancel">Hủy</Button><Button type="submit" variant="primary" disabled={busy} data-testid="user-edit-submit">{busy ? 'Đang lưu...' : 'Lưu'}</Button></>}>
      <Field label="Họ tên" error={nameError}>
        <Input autoFocus value={fullName} aria-invalid={!!nameError} onChange={(e) => setFullName(e.target.value)} data-testid="user-edit-fullname" />
      </Field>
      {showRole && (
        <Field label="Vai trò" hint={canChangeRole ? undefined : user.role === 'root' ? 'Không thể đổi vai trò của tài khoản root.' : 'Bạn không thể tự đổi vai trò của chính mình.'}>
          <Select value={role} disabled={!canChangeRole} onChange={(e) => setRole(e.target.value as Role)} data-testid="user-edit-role">
            {user.role === 'root' && <option value="root">{ROLE_LABEL.root}</option>}
            <option value="user">{ROLE_LABEL.user}</option>
            <option value="admin">{ROLE_LABEL.admin}</option>
          </Select>
        </Field>
      )}
      <ErrorBox message={error} testId="user-edit-error" />
    </Shell>
  )
}

export function ResetPasswordModal({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: (password: string) => void }) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [pwError, setPwError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const bad = validatePassword(password)
    setPwError(bad)
    if (bad) return
    setBusy(true)
    setError('')
    try {
      await callAdmin({ action: 'reset_password', user_id: user.id, password })
      onDone(password)
    } catch (err) {
      setError(messageOf(err))
      toast.error(messageOf(err))
      setBusy(false)
    }
  }

  return (
    <Shell title={`Đặt lại mật khẩu cho ${user.username}`} onClose={onClose} busy={busy} testId="user-reset-modal" onSubmit={submit}
      footer={<><Button onClick={onClose} disabled={busy} data-testid="user-reset-cancel">Hủy</Button><Button type="submit" variant="primary" disabled={busy} data-testid="user-reset-submit">{busy ? 'Đang lưu...' : 'Đặt lại'}</Button></>}>
      <p className="text-gray-700">Người dùng <b>{user.full_name}</b> sẽ đăng nhập bằng mật khẩu mới này.</p>
      <PasswordField value={password} onChange={setPassword} error={pwError} testId="user-reset" />
      <ErrorBox message={error} testId="user-reset-error" />
    </Shell>
  )
}
