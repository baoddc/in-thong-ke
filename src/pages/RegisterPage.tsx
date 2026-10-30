import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MAX_PASSWORD, MIN_PASSWORD, makeUsername } from '../lib/auth'
import { callFunction, messageOf } from '../lib/useAdminUsers'
import Button, { buttonClass } from '../components/ui/Button'
import { Field, Input } from '../components/ui/Input'

type Errors = { name?: string; password?: string; confirm?: string }

/** D-015: tự đăng ký → tài khoản chờ admin duyệt. Gọi Edge Function công khai `register`. */
export default function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [website, setWebsite] = useState('') // honeypot: người thật không thấy nên luôn rỗng
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ username: string } | null>(null)

  const name = fullName.trim().replace(/\s+/g, ' ')
  const preview = makeUsername(name)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const next: Errors = {
      name: name ? undefined : 'Vui lòng nhập họ tên.',
      password: password.length < MIN_PASSWORD ? `Mật khẩu phải có ít nhất ${MIN_PASSWORD} ký tự.` : password.length > MAX_PASSWORD ? `Mật khẩu không quá ${MAX_PASSWORD} ký tự.` : undefined,
      confirm: confirm === password ? undefined : 'Mật khẩu nhập lại không khớp.',
    }
    setErrors(next)
    if (next.name || next.password || next.confirm) return
    setBusy(true)
    setError('')
    try {
      const r = await callFunction<{ username: string; full_name: string }>('register', { full_name: name, password, website })
      setDone({ username: r.username })
    } catch (err) {
      setError(messageOf(err))
    }
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-dark via-primary to-ink p-4">
      <div className="w-full max-w-md animate-pop-in overflow-hidden rounded-2xl bg-white shadow-2xl">
        <img src="/header-daidung.png" alt="Công ty Cổ phần Cơ khí Xây dựng Thương mại Đại Dũng" className="block w-full border-b border-stone-100" />
        {done ? (
          <div className="space-y-4 p-6 text-center" data-testid="register-success">
            <h1 className="text-xl font-bold">Đăng ký thành công</h1>
            <p className="text-gray-800">
              Tên đăng nhập của bạn: <b className="select-all text-lg" data-testid="register-username">{done.username}</b>
            </p>
            <p className="text-gray-700">Tài khoản đang chờ quản trị viên duyệt — bạn sẽ đăng nhập được sau khi được duyệt.</p>
            <Link to="/dang-nhap" className={`${buttonClass('primary')} w-full`} data-testid="register-to-login">Về trang đăng nhập</Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4 p-6" data-testid="register-form">
            <div className="space-y-1 text-center">
              <h1 className="text-xl font-bold" data-testid="register-title">Đăng ký tài khoản</h1>
              <p className="text-sm text-muted">Tài khoản cần quản trị viên duyệt trước khi đăng nhập</p>
            </div>
            <div>
              <Field label="Họ tên" error={errors.name}>
                <Input type="text" autoComplete="name" autoFocus value={fullName} aria-invalid={!!errors.name} onChange={(e) => setFullName(e.target.value)} data-testid="register-fullname" />
              </Field>
              {preview && (
                <p className="mt-1 text-sm text-gray-700" data-testid="register-preview">
                  Tên đăng nhập sẽ là: <b>{preview}</b> <span className="text-muted">(nếu trùng sẽ thêm số)</span>
                </p>
              )}
            </div>
            <div className="relative">
              <Field label="Mật khẩu" error={errors.password} hint={`Ít nhất ${MIN_PASSWORD} ký tự`}>
                <Input type={show ? 'text' : 'password'} autoComplete="new-password" value={password} aria-invalid={!!errors.password}
                  onChange={(e) => setPassword(e.target.value)} className="pr-20" data-testid="register-password" />
              </Field>
              <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label="Hiện mật khẩu" data-testid="register-toggle-password"
                className="absolute right-0 top-6 h-10 rounded-card px-3 text-sm font-medium text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                {show ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
            <Field label="Nhập lại mật khẩu" error={errors.confirm}>
              <Input type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} aria-invalid={!!errors.confirm}
                onChange={(e) => setConfirm(e.target.value)} data-testid="register-confirm" />
            </Field>
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} data-testid="register-website" />
            </div>
            {error && <p role="alert" className="rounded-card border border-danger-line bg-danger-soft p-2 text-danger" data-testid="register-error">{error}</p>}
            <Button type="submit" variant="primary" disabled={busy} className="w-full" data-testid="register-submit">{busy ? 'Đang gửi...' : 'Đăng ký'}</Button>
            <p className="text-center text-sm text-gray-700">
              Đã có tài khoản?{' '}
              <Link to="/dang-nhap" className="font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="register-login-link">Đăng nhập</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
