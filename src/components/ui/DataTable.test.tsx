// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DataTable, { type Column } from './DataTable'

const columns: Column<{ id: number; a: string; b: string }>[] = [
  { key: 'a', header: 'Cột A', render: (r) => r.a },
  { key: 'b', header: 'Cột B', render: (r) => r.b },
]
const table = () => (
  <DataTable columns={columns} rows={[{ id: 1, a: 'x', b: 'y' }]} rowKey={(r) => r.id} loading={false} error="" onRetry={() => {}}
    sort="" dir="asc" onSort={() => {}} empty="trống" testId="t-resize" />
)
const th = (name: string) => screen.getByRole('columnheader', { name: new RegExp(name) })

beforeEach(() => { window.localStorage.clear() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('DataTable: kéo giãn cột', () => {
  it('kéo mép tiêu đề đổi độ rộng, nhớ cho lần sau, bấm đúp về mặc định, không nhỏ hơn mức tối thiểu', () => {
    const { unmount } = render(table())
    const h = screen.getByTestId('resize-a')
    expect(th('Cột A').style.width).toBe('')
    fireEvent.pointerDown(h, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(h, { clientX: 300, pointerId: 1 })
    fireEvent.pointerUp(h, { clientX: 300, pointerId: 1 })
    expect(th('Cột A').style.width).toBe('200px') // jsdom không có layout: rộng gốc 0 + 200px kéo
    expect(th('Cột B').style.width).toBe('') // cột khác không đổi
    unmount()
    render(table()) // mở lại: đọc từ localStorage
    expect(th('Cột A').style.width).toBe('200px')
    fireEvent.pointerDown(screen.getByTestId('resize-a'), { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(screen.getByTestId('resize-a'), { clientX: 0, pointerId: 1 })
    fireEvent.pointerUp(screen.getByTestId('resize-a'), { clientX: 0, pointerId: 1 })
    expect(th('Cột A').style.width).toBe('144px') // tối thiểu = bề rộng ô nhập của dòng nhập
    fireEvent.doubleClick(screen.getByTestId('resize-a'))
    expect(th('Cột A').style.width).toBe('')
  })

  it('phím mũi tên chỉnh độ rộng; dữ liệu lưu hỏng thì bỏ qua', () => {
    window.localStorage.setItem('col-w:t-resize', '{"a":"abc","b":100}') // sai kiểu / dưới mức tối thiểu (độ rộng cũ hẹp hơn 144px bị bỏ)
    render(table())
    expect(th('Cột A').style.width).toBe('')
    expect(th('Cột B').style.width).toBe('')
    fireEvent.keyDown(screen.getByTestId('resize-b'), { key: 'ArrowRight' })
    expect(th('Cột B').style.width).toBe('144px') // jsdom không có layout: 0 + 16 → nâng lên mức tối thiểu 144px
  })
})
