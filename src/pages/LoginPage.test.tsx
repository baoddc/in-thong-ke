// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const signIn = vi.fn()
vi.mock('../lib/supabase', () => ({ supabase: { auth: { signInWithPassword: (a: unknown) => signIn(a) } } }))

import LoginPage, { loginErrorMessage } from './LoginPage'

afterEach(() => { cleanup(); signIn.mockReset() })

describe('loginErrorMessage', () => {
  it('sai mật khẩu / mạng lỗi / quá nhiều lần → tiếng Việt', () => {
    expect(loginErrorMessage({ status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('Email hoặc mật khẩu không đúng.')
    expect(loginErrorMessage({ status: 0, message: 'Failed to fetch' })).toContain('Không kết nối được')
    expect(loginErrorMessage({ status: 429, message: 'rate limit' })).toContain('quá nhiều lần')
  })
})

describe('LoginPage', () => {
  it('có tên ứng dụng, hiện/ẩn mật khẩu, sai mật khẩu thì báo lỗi tiếng Việt', async () => {
    signIn.mockResolvedValue({ error: { status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' } })
    render(<LoginPage />)
    expect(screen.getByTestId('login-title').textContent).toBe('In thống kê — Kho An Hạ')
    const pw = screen.getByTestId('login-password') as HTMLInputElement
    expect(pw.type).toBe('password')
    await userEvent.click(screen.getByTestId('login-toggle-password'))
    expect(pw.type).toBe('text')

    await userEvent.type(screen.getByTestId('login-email'), 'a@b.vn')
    await userEvent.type(pw, 'sai')
    await userEvent.click(screen.getByTestId('login-submit'))
    expect((await screen.findByTestId('login-error')).textContent).toBe('Email hoặc mật khẩu không đúng.')
    expect(signIn).toHaveBeenCalledWith({ email: 'a@b.vn', password: 'sai' })
  })
})
