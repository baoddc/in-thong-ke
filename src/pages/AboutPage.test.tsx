// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import AboutPage from './AboutPage'

afterEach(cleanup)

describe('Trang Giới thiệu', () => {
  it('có tiêu đề, tên ứng dụng, đủ 10 thẻ chức năng và dòng phiên bản', () => {
    render(<AboutPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Giới thiệu' })).toBeTruthy()
    expect(screen.getByText('In thống kê — Kho An Hạ')).toBeTruthy()
    expect(screen.getAllByTestId('feature-card')).toHaveLength(10)
    expect(screen.getByRole('heading', { name: 'Nhập phiếu thống kê' })).toBeTruthy()
    expect(screen.getByText('Phiên bản 30/10/2026')).toBeTruthy()
  })
})
