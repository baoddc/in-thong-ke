import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import Button from '../components/ui/Button'
import { Field, Input } from '../components/ui/Input'

/** Lỗi đăng nhập của Supabase Auth -> thông báo tiếng Việt. */
export function loginErrorMessage(err: { status?: number; code?: string; message?: string }): string {
  if (err.code === 'invalid_credentials' || err.status === 400) return 'Email hoặc mật khẩu không đúng.'
  if (err.status === 429) return 'Bạn thử quá nhiều lần. Vui lòng chờ ít phút rồi thử lại.'
  if (!err.status || /fetch|network/i.test(err.message ?? '')) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'
  return `Không đăng nhập được: ${err.message ?? 'không rõ nguyên nhân'}`
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(loginErrorMessage(error))
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-dark via-primary to-ink p-4">
      <form onSubmit={submit} className="w-full max-w-md animate-pop-in overflow-hidden rounded-2xl bg-white shadow-2xl">
        <img src="/header-daidung.png" alt="Công ty Cổ phần Cơ khí Xây dựng Thương mại Đại Dũng" className="block w-full border-b border-stone-100" />
        <div className="space-y-4 p-6">
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-bold" data-testid="login-title">In thống kê — Kho An Hạ</h1>
            <p className="text-sm text-muted">Đăng nhập để tiếp tục</p>
          </div>
        <Field label="Email">
          <Input type="email" required autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email" />
        </Field>
        <div className="relative">
          <Field label="Mật khẩu">
            <Input type={show ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="pr-20" data-testid="login-password" />
          </Field>
          <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label="Hiện mật khẩu" data-testid="login-toggle-password"
            className="absolute bottom-0 right-0 h-10 rounded-card px-3 text-sm font-medium text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {show ? 'Ẩn' : 'Hiện'}
          </button>
        </div>
        {error && <p role="alert" className="rounded-card border border-danger-line bg-danger-soft p-2 text-danger" data-testid="login-error">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy} className="w-full" data-testid="login-submit">
          {busy ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </Button>
        </div>
      </form>
    </div>
  )
}
