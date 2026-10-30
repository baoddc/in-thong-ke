// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Pagination from './Pagination'

afterEach(cleanup)
const mount = (props: Partial<Parameters<typeof Pagination>[0]>) => {
  const onPage = vi.fn()
  render(<Pagination page={1} size={50} total={120} rowCount={50} onPage={onPage} onSize={() => {}} {...props} />)
  return onPage
}

describe('Pagination', () => {
  it('tổng chính xác: "tổng N dòng" và số trang thật', () => {
    mount({ total: 16500 })
    expect(screen.getByTestId('page-total').textContent).toContain('tổng 16.500 dòng')
    expect(screen.getByTestId('page-count').textContent).toBe('/330')
  })

  it('tổng chạm trần 10001: "hơn 10.000 dòng", "/200+", Sau bật khi trang 201 đầy, ô số trang không bị chặn', () => {
    const onPage = mount({ page: 201, total: 10001, rowCount: 50 })
    expect(screen.getByTestId('page-total').textContent).toContain('hơn 10.000 dòng')
    expect(screen.getByTestId('page-count').textContent).toBe('/200+')
    expect((screen.getByTestId('page-input') as HTMLInputElement).value).toBe('201')
    const next = screen.getByTestId('page-next') as HTMLButtonElement
    expect(next.disabled).toBe(false)
    fireEvent.click(next)
    expect(onPage).toHaveBeenCalledWith(202)
    fireEvent.change(screen.getByTestId('page-input'), { target: { value: '500' } })
    fireEvent.keyDown(screen.getByTestId('page-input'), { key: 'Enter' })
    expect(onPage).toHaveBeenCalledWith(500)
  })

  it('tổng chạm trần nhưng trang chưa đầy: Sau tắt', () => {
    mount({ page: 201, total: 10001, rowCount: 7 })
    expect((screen.getByTestId('page-next') as HTMLButtonElement).disabled).toBe(true)
  })
})
