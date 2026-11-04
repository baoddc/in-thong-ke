// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
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
