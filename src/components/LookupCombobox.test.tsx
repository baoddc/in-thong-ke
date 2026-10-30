// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ rpc: (() => Promise.resolve({ data: [], error: null })) as (fn: string, args: Record<string, unknown>) => Promise<unknown> }))
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (fn: string, args: Record<string, unknown>) => h.rpc(fn, args) } })) // không tạo client thật khi test

import LookupCombobox from './LookupCombobox'

const items = [{ id: 1, name: 'Nguyễn Văn Sáu' }, { id: 2, name: 'Đặng Văn Bảy' }]

// Cha giữ selectedIds như PlansPage để kiểm tra đúng luồng controlled.
function Host({ multiple }: { multiple?: boolean }) {
  const [ids, setIds] = useState<number[]>([])
  return <LookupCombobox label="Tài xế" kind="driver" items={items} selectedIds={ids} multiple={multiple}
    onChange={setIds} reload={async () => {}} testId="drv" />
}

afterEach(cleanup)

describe('LookupCombobox', () => {
  it('gõ được vào ô (value theo chữ đang gõ)', async () => {
    render(<Host />)
    const input = screen.getByRole('combobox')
    await userEvent.type(input, 'abc')
    expect((input as HTMLInputElement).value).toBe('abc')
    expect(screen.getByTestId('drv-add').textContent).toContain('Thêm "abc"')
  })

  it('gõ không dấu → gợi ý → chọn bằng chuột; gõ lại thì bỏ chọn', async () => {
    render(<Host />)
    const input = screen.getByRole('combobox') as HTMLInputElement
    await userEvent.type(input, 'dang')
    expect(screen.queryByTestId('drv-add')).not.toBeNull() // "dang" không trùng khít tên nào
    await userEvent.click(screen.getByRole('option', { name: 'Đặng Văn Bảy' }))
    expect(input.value).toBe('Đặng Văn Bảy')
    expect(screen.queryByRole('listbox')).toBeNull()
    await userEvent.type(input, 'x')
    expect(input.value).toBe('Đặng Văn Bảyx')
  })

  it('chọn nhiều: thêm chip, xóa chữ, ẩn mục đã chọn; bấm × để bỏ', async () => {
    render(<Host multiple />)
    const input = screen.getByRole('combobox') as HTMLInputElement
    await userEvent.type(input, 'van{ArrowDown}{Enter}')
    expect(input.value).toBe('')
    expect(screen.getByTestId('drv-chips').textContent).toContain('Đặng Văn Bảy')
    await userEvent.type(input, 'van')
    expect(screen.queryByRole('option', { name: 'Đặng Văn Bảy' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ Đặng Văn Bảy' }))
    expect(screen.queryByTestId('drv-chips')).toBeNull()
  })
})

// Chế độ server (D-012): danh mục lớn không tải sẵn, gõ → gọi RPC sau 250 ms.
describe('LookupCombobox - chế độ server', () => {
  const row = (id: number, name: string) => ({ id, kind: 'vehicle', name, code: null })
  function ServerHost({ ids = [], known }: { ids?: number[]; known?: { id: number; name: string }[] }) {
    const [sel, setSel] = useState<number[]>(ids)
    return <LookupCombobox label="Số xe" kind="vehicle" server known={known} selectedIds={sel} onChange={setSel} allowAdd={false} testId="veh" />
  }

  it('debounce: gõ liên tiếp chỉ gọi 1 lần; kết quả của lần gọi cũ về muộn bị bỏ', async () => {
    const calls: { q: unknown; done: (v: unknown) => void }[] = []
    h.rpc = (_fn, args) => new Promise((done) => calls.push({ q: args.p_q, done }))
    render(<ServerHost />)
    const input = screen.getByRole('combobox')
    await userEvent.type(input, 'xe')
    expect(calls).toHaveLength(0) // chưa đủ 250 ms
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].q).toBe('xe')
    await userEvent.type(input, '2') // lần gọi 1 còn treo, gõ tiếp → lần gọi 2
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1].q).toBe('xe2')
    calls[1].done({ data: [row(2, 'Xe 2')], error: null })
    await screen.findByRole('option', { name: 'Xe 2' })
    calls[0].done({ data: [row(1, 'Xe cũ')], error: null }) // về muộn
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('option', { name: 'Xe cũ' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Xe 2' })).toBeTruthy()
  })

  it('id đã chọn có tên sẵn (known) → hiện ngay, không gọi server', async () => {
    const spy = vi.fn(() => Promise.resolve({ data: [], error: null }))
    h.rpc = spy
    render(<ServerHost ids={[5]} known={[{ id: 5, name: 'Xe 51D-44521' }]} />)
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('Xe 51D-44521')
    await new Promise((r) => setTimeout(r, 300))
    expect(spy).not.toHaveBeenCalled()
  })

  it('id chưa biết tên → lấy qua get_lookup_items', async () => {
    const spy = vi.fn(() => Promise.resolve({ data: [row(9, 'Xe số 9')], error: null }))
    h.rpc = spy
    render(<ServerHost ids={[9]} />)
    await waitFor(() => expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('Xe số 9'))
    expect(spy).toHaveBeenCalledWith('get_lookup_items', { p_ids: [9] })
  })
})