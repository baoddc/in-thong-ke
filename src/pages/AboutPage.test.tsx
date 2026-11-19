// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import AboutPage from './AboutPage'

afterEach(cleanup)

const renderPage = () => render(<MemoryRouter><AboutPage /></MemoryRouter>)

describe('Trang Giới thiệu', () => {
  it('có tiêu đề, tên ứng dụng, 3 cụm với 12 thẻ chức năng gồm Báo cáo và Google Sheet', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Giới thiệu' })).toBeTruthy()
    expect(screen.getByText('In thống kê — Kho An Hạ')).toBeTruthy()
    expect(screen.queryByTestId('stat-tile')).toBeNull()
    expect(screen.getAllByTestId('feature-group')).toHaveLength(3)
    expect(screen.getAllByTestId('feature-card')).toHaveLength(12)
    expect(screen.getByRole('heading', { name: 'Giữ chỗ số phiếu TK' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Yêu cầu sửa sau 24 giờ' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Báo cáo' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Đồng bộ Google Sheet' })).toBeTruthy()
  })

  it('các bước bắt đầu nhanh là liên kết tới đúng trang, chân trang trỏ tới Luồng công việc', () => {
    renderPage()
    const hrefs = screen.getAllByTestId('step-link').map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/', '/bang-kiem', '/in-thong-ke', '/bao-cao'])
    expect(screen.getByTestId('workflow-link').getAttribute('href')).toBe('/luong-cong-viec')
  })

  it('bảng phân quyền có 7 thao tác × 3 vai trò (không nhắc root) và phím tắt dạng kbd', () => {
    renderPage()
    const roles = screen.getByTestId('about-roles')
    expect(within(roles).getAllByTestId('role-row')).toHaveLength(7)
    for (const r of ['Admin', 'Người dùng', 'Chỉ xem']) expect(within(roles).getByRole('columnheader', { name: r })).toBeTruthy()
    expect(screen.getByTestId('about-page').textContent).not.toMatch(/root/i)
    const keys = Array.from(screen.getByTestId('about-shortcuts').querySelectorAll('kbd')).map((k) => k.textContent)
    expect(keys).toEqual(['N', '/', 'Ctrl', 'Enter', 'Tab'])
  })
})
