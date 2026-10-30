// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: (n: string, o: unknown) => invoke(n, o) } } }))

import RegisterPage from './RegisterPage'

afterEach(() => { cleanup(); invoke.mockReset() })

const setup = () => render(<MemoryRouter><RegisterPage /></MemoryRouter>)
const type = (id: string, text: string) => userEvent.type(screen.getByTestId(id), text)

describe('RegisterPage (D-015)', () => {
  it('xem trước tên đăng nhập khi gõ họ tên', async () => {
    setup()
    await type('register-fullname', 'Lê Thái Bão')
    expect(screen.getByTestId('register-preview').textContent).toContain('bao.lt')
    expect(screen.getByTestId('register-preview').textContent).toContain('nếu trùng sẽ thêm số')
  })

  it('mật khẩu ngắn / không khớp → báo lỗi cạnh ô, không gọi máy chủ', async () => {
    setup()
    await type('register-fullname', 'Lê Thái Bão')
    await type('register-password', 'ngan')
    await type('register-confirm', 'khac')
    await userEvent.click(screen.getByTestId('register-submit'))
    expect(screen.getByText('Mật khẩu phải có ít nhất 6 ký tự.')).toBeTruthy()
    expect(screen.getByText('Mật khẩu nhập lại không khớp.')).toBeTruthy()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('hợp lệ → gọi register đúng body (kèm honeypot rỗng) và hiện tên đăng nhập máy chủ trả về', async () => {
    invoke.mockResolvedValue({ data: { username: 'bao.lt2', full_name: 'Lê Thái Bão' }, error: null })
    setup()
    await type('register-fullname', '  Lê Thái Bão ')
    await type('register-password', 'matkhau123')
    await type('register-confirm', 'matkhau123')
    await userEvent.click(screen.getByTestId('register-submit'))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('register', { body: { full_name: 'Lê Thái Bão', password: 'matkhau123', website: '' } }))
    expect((await screen.findByTestId('register-username')).textContent).toBe('bao.lt2')
    expect(screen.getByTestId('register-success').textContent).toContain('chờ quản trị viên duyệt')
    expect(screen.getByTestId('register-to-login').getAttribute('href')).toBe('/dang-nhap')
  })

  it('lỗi từ máy chủ hiện rõ, vẫn ở form', async () => {
    const { FunctionsHttpError } = await import('@supabase/supabase-js')
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: 'Đang có quá nhiều yêu cầu chờ duyệt' }), { status: 429 })) })
    setup()
    await type('register-fullname', 'An')
    await type('register-password', 'matkhau123')
    await type('register-confirm', 'matkhau123')
    await userEvent.click(screen.getByTestId('register-submit'))
    expect((await screen.findByTestId('register-error')).textContent).toBe('Đang có quá nhiều yêu cầu chờ duyệt')
    expect(screen.queryByTestId('register-success')).toBeNull()
  })

  it('ô honeypot ẩn khỏi trình đọc màn hình và bàn phím', () => {
    setup()
    const hp = screen.getByTestId('register-website') as HTMLInputElement
    expect(hp.tabIndex).toBe(-1)
    expect(hp.autocomplete).toBe('off')
    expect(hp.closest('[aria-hidden="true"]')).toBeTruthy()
  })
})
