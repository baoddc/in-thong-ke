// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Avatar from './Avatar'

afterEach(cleanup)

describe('Avatar', () => {
  it('chưa có ảnh: chữ cái đầu viết hoa (kể cả chữ có dấu)', () => {
    const initial = () => screen.getByTestId('avatar-initial')
    const { rerender } = render(<Avatar name="lê Thái Bão" />)
    expect(initial().getAttribute('data-initials')).toBe('L')
    expect(initial().textContent).toBe('') // chữ cái vẽ bằng CSS, không lẫn vào văn bản của phần tử cha
    rerender(<Avatar name="đức" path={null} />)
    expect(initial().getAttribute('data-initials')).toBe('Đ')
    rerender(<Avatar name="  " />)
    expect(initial().getAttribute('data-initials')).toBe('?')
  })

  it('có ảnh: hiện ảnh từ bucket công khai; ảnh lỗi thì quay về chữ cái, đổi sang ảnh khác thì thử lại', () => {
    const { rerender } = render(<Avatar name="Bão" path="u1/1700000000000.webp" />)
    const img = screen.getByTestId('avatar-img') as HTMLImageElement
    expect(img.src).toContain('/storage/v1/object/public/avatars/u1/1700000000000.webp')
    fireEvent.error(img)
    expect(screen.queryByTestId('avatar-img')).toBeNull()
    expect(screen.getByTestId('avatar-initial').getAttribute('data-initials')).toBe('B')
    rerender(<Avatar name="Bão" path="u1/1700000000001.webp" />)
    expect(screen.getByTestId('avatar-img')).toBeTruthy()
  })
})
