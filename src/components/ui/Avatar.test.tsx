// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Avatar from './Avatar'

afterEach(cleanup)

describe('Avatar', () => {
  it('chưa có ảnh: chữ cái đầu viết hoa (kể cả chữ có dấu)', () => {
    const { rerender } = render(<Avatar name="lê Thái Bão" />)
    expect(screen.getByTestId('avatar-initial').textContent).toBe('L')
    rerender(<Avatar name="đức" path={null} />)
    expect(screen.getByTestId('avatar-initial').textContent).toBe('Đ')
    rerender(<Avatar name="  " />)
    expect(screen.getByTestId('avatar-initial').textContent).toBe('?')
  })

  it('có ảnh: hiện ảnh từ bucket công khai; ảnh lỗi thì quay về chữ cái, đổi sang ảnh khác thì thử lại', () => {
    const { rerender } = render(<Avatar name="Bão" path="u1/1700000000000.webp" />)
    const img = screen.getByTestId('avatar-img') as HTMLImageElement
    expect(img.src).toContain('/storage/v1/object/public/avatars/u1/1700000000000.webp')
    fireEvent.error(img)
    expect(screen.queryByTestId('avatar-img')).toBeNull()
    expect(screen.getByTestId('avatar-initial').textContent).toBe('B')
    rerender(<Avatar name="Bão" path="u1/1700000000001.webp" />)
    expect(screen.getByTestId('avatar-img')).toBeTruthy()
  })
})
