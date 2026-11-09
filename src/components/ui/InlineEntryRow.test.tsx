// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InlineEntryRow, { type InlineControls } from './InlineEntryRow'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const renderRow = (dirty: boolean, onCancel: () => void) => {
  const ref = createRef<InlineControls | null>() as { current: InlineControls | null }
  render(<table><tbody><InlineEntryRow saveLabel="Lưu" controlsRef={ref} columnKeys={['a']} cells={{ a: 'x' }} error="" busy={false}
    dirty={dirty} onSave={() => {}} onCancel={onCancel} testId="row" /></tbody></table>)
  return ref
}

describe('InlineEntryRow ← → sang ô kế', () => {
  it('chỉ chuyển ô khi con trỏ ở mép chữ; bỏ qua ô chỉ đọc', async () => {
    render(<table><tbody><InlineEntryRow saveLabel="Lưu" columnKeys={['a', 'b', 'c']} error="" busy={false} dirty={false} onSave={() => {}} onCancel={() => {}} testId="row"
      cells={{ a: <input aria-label="a" defaultValue="xy" />, b: <input aria-label="b" readOnly />, c: <input aria-label="c" defaultValue="z" /> }} /></tbody></table>)
    const [a, , c] = [screen.getByLabelText('a'), screen.getByLabelText('b'), screen.getByLabelText('c')] as HTMLInputElement[]
    a.focus(); a.setSelectionRange(1, 1)
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(a) // còn chữ bên phải: lướt chữ bình thường
    a.setSelectionRange(2, 2)
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(c)
    c.setSelectionRange(0, 0)
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(a)
  })
})

describe('InlineEntryRow cancel (D-030: chuyển dòng sửa không mất dữ liệu)', () => {
  it('đang nhập dở, người dùng không đồng ý bỏ → giữ dòng, trả false', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onCancel = vi.fn()
    expect(renderRow(true, onCancel).current!.cancel()).toBe(false)
    expect(onCancel).not.toHaveBeenCalled()
  })
  it('không có thay đổi → đóng ngay không hỏi, trả true', () => {
    const confirm = vi.spyOn(window, 'confirm')
    const onCancel = vi.fn()
    expect(renderRow(false, onCancel).current!.cancel()).toBe(true)
    expect(onCancel).toHaveBeenCalledOnce()
    expect(confirm).not.toHaveBeenCalled()
  })
})
