// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DateInput from './DateInput'

afterEach(cleanup)

const onChange = vi.fn()
function Harness({ initial = '' }: { initial?: string }) {
  const [v, setV] = useState(initial)
  return (
    <>
      <label>Ngày<DateInput value={v} onChange={(x) => { onChange(x); setV(x) }} data-testid="d" /></label>
      <button onClick={() => setV('')}>xoa</button>
      <output data-testid="iso">{v}</output>
    </>
  )
}
const input = () => screen.getByTestId('d') as HTMLInputElement

describe('DateInput', () => {
  it('hiện dd/mm/yyyy (không phải mm/dd/yyyy) từ giá trị ISO và có placeholder', () => {
    render(<Harness initial="2026-10-29" />)
    expect(input().value).toBe('29/10/2026')
    expect(input().type).toBe('text')
    cleanup()
    render(<Harness />)
    expect(input().placeholder).toBe('dd/mm/yyyy')
  })

  it('gõ liền 8 số → tự chèn "/" và trả ISO', async () => {
    onChange.mockClear()
    render(<Harness />)
    await userEvent.type(input(), '12102026')
    expect(input().value).toBe('12/10/2026')
    expect(screen.getByTestId('iso').textContent).toBe('2026-10-12')
    expect(onChange).toHaveBeenLastCalledWith('2026-10-12')
  })

  it('ngày không có thật → báo lỗi tiếng Việt, giá trị rỗng, chặn gửi form', async () => {
    render(<Harness />)
    await userEvent.type(input(), '31022026')
    expect(screen.getByTestId('iso').textContent).toBe('')
    expect((await screen.findByTestId('d-error')).textContent).toContain('Ngày không hợp lệ')
    expect(input().validity.customError).toBe(true)
  })

  it('xóa bớt → giá trị rỗng; xóa từ ngoài → ô trống', async () => {
    render(<Harness initial="2026-10-29" />)
    await userEvent.type(input(), '{Backspace}')
    expect(screen.getByTestId('iso').textContent).toBe('')
    cleanup()
    render(<Harness initial="2026-10-29" />)
    await userEvent.click(screen.getByText('xoa'))
    expect(input().value).toBe('')
  })

  it('dán ISO (vd tự động điền) vẫn ra đúng', () => {
    render(<Harness />)
    fireEvent.change(input(), { target: { value: '2026-10-01' } })
    expect(input().value).toBe('01/10/2026')
    expect(screen.getByTestId('iso').textContent).toBe('2026-10-01')
  })
})
