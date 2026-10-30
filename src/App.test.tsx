// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() } } }))

import { Layout } from './App'

afterEach(() => { cleanup(); localStorage.clear() })

const renderLayout = () => render(
  <MemoryRouter>
    <Routes><Route element={<Layout email="a@b.vn" />}><Route path="/" element={<p>Nội dung</p>} /></Route></Routes>
  </MemoryRouter>,
)

describe('Layout sidebar', () => {
  it('có 5 mục theo thứ tự, Luồng công việc sau Danh mục', () => {
    renderLayout()
    const labels = screen.getByRole('navigation', { name: 'Menu chính' }).textContent
    expect(labels).toBe('Nhập phiếuBảng kiểmIn thống kêDanh mụcLuồng công việc')
  })

  it('đủ 5 mục, mỗi mục là liên kết có nhãn đọc được (kể cả mục đang chọn "Nhập phiếu")', () => {
    renderLayout()
    const nav = screen.getByRole('navigation', { name: 'Menu chính' })
    const links = Array.from(nav.querySelectorAll('a'))
    expect(links.map((a) => a.textContent)).toEqual(['Nhập phiếu', 'Bảng kiểm', 'In thống kê', 'Danh mục', 'Luồng công việc'])
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/bang-kiem', '/in-thong-ke', '/danh-muc', '/luong-cong-viec'])
    for (const name of ['Nhập phiếu', 'Bảng kiểm', 'In thống kê', 'Danh mục', 'Luồng công việc']) expect(screen.getByRole('link', { name })).toBeTruthy()
    // mục đang chọn: chữ trắng trên nền sidebar tối, không phụ thuộc nền riêng (lỗi cũ: chữ trắng + nền primary không vẽ → "mất" mục)
    const active = screen.getByRole('link', { name: 'Nhập phiếu' })
    expect(active.getAttribute('aria-current')).toBe('page')
    expect(active.className).toContain('text-white')
    expect(active.className).not.toMatch(/\bbg-primary\b/)
    expect(links.every((a) => !/\b(hidden|invisible)\b/.test(a.className))).toBe(true)
  })

  it('thu gọn ẩn nhãn (còn aria-label/title), mở rộng hiện lại và nhớ trạng thái', async () => {
    renderLayout()
    expect(screen.getByText('Bảng kiểm')).toBeTruthy()
    await userEvent.click(screen.getByTestId('toggle-sidebar'))
    expect(screen.queryByText('Bảng kiểm')).toBeNull()
    expect(screen.getByLabelText('Bảng kiểm').getAttribute('title')).toBe('Bảng kiểm')
    expect(localStorage.getItem('sidebar-collapsed')).toBe('1')
    await userEvent.click(screen.getByTestId('toggle-sidebar'))
    expect(screen.getByText('Bảng kiểm')).toBeTruthy()
  })
})
