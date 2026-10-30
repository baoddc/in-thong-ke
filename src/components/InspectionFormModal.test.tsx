// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const plan = {
  id: 7, tk_number: 'TK-1', export_date: '2026-10-28', transport_order_no: '008784',
  vehicle: { name: '51D-44521' }, driver: { name: 'Phạm Minh Luân' }, fg_exporter: { name: 'Lê Văn Chiêu' }, material_exporters: [],
}
const inserted: Record<string, unknown>[] = []
const updated: Record<string, unknown>[] = []

vi.mock('../lib/supabase', () => {
  const chain = (data: unknown) => {
    const c: Record<string, unknown> = {
      then: (r: (v: unknown) => unknown) => r({ data, error: null }),
      maybeSingle: () => Promise.resolve({ data: plan, error: null }),
      insert: (p: Record<string, unknown>) => { inserted.push(p); return Promise.resolve({ error: null }) },
      update: (p: Record<string, unknown>) => { updated.push(p); return c },
    }
    for (const m of ['select', 'order', 'range', 'eq']) c[m] = () => c
    return c
  }
  // số TK tìm phía server (D-012)
  const rpc = () => Promise.resolve({ data: [{ id: 7, tk_number: 'TK-1', export_date: '2026-10-28' }], error: null })
  return { supabase: { rpc, from: (t: string) => chain(t === 'transport_plans' ? [{ id: 7, tk_number: 'TK-1' }] : []) } }
})

import InspectionFormModal from './InspectionFormModal'
import type { InspectionRow } from '../types/inspection'

const items = [
  { id: 1, kind: 'fg_exporter', name: 'Lê Văn Chiêu', code: null, created_at: '', updated_at: '' },
  { id: 2, kind: 'material_exporter', name: 'Trần Văn Bình', code: null, created_at: '', updated_at: '' },
  { id: 3, kind: 'material_exporter', name: 'Lê Văn Chiêu', code: null, created_at: '', updated_at: '' }, // trùng tên → chỉ hiện một lần
]
const lookups = { byKind: (k: string) => items.filter((i) => i.kind === k), loading: false, error: '', reload: async () => {} }

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
})
afterEach(() => { cleanup(); inserted.length = 0; updated.length = 0 })

async function pickTk() {
  const user = userEvent.setup()
  render(<InspectionFormModal row={null} lookups={lookups} onClose={() => {}} onSaved={() => {}} />)
  await act(() => new Promise((r) => setTimeout(r, 20))) // chờ danh sách số TK tải xong (ô TK khởi tạo lại khi xong)
  await user.type(await screen.findByTestId('tk'), 'TK-1')
  await user.click(await screen.findByRole('option', { name: /TK-1/ }))
  return user
}
const shipperInput = () => screen.getByTestId('shipper') as HTMLInputElement

describe('InspectionFormModal - NV xuất hàng', () => {
  it('chọn số TK → điền sẵn người theo phiếu và ô vẫn sửa được', async () => {
    const user = await pickTk()
    await waitFor(() => expect(shipperInput().value).toBe('Lê Văn Chiêu'))
    expect(shipperInput().readOnly).toBe(false)
    await user.clear(shipperInput())
    await user.type(shipperInput(), 'binh')
    await user.click(await screen.findByRole('option', { name: 'Trần Văn Bình' }))
    expect(shipperInput().value).toBe('Trần Văn Bình')
  })

  it('lưu: giữ người theo phiếu → shipper_id null; chọn người khác → id', async () => {
    const user = await pickTk()
    await waitFor(() => expect(shipperInput().value).toBe('Lê Văn Chiêu'))
    await user.click(screen.getByTestId('inspection-save'))
    await waitFor(() => expect(inserted).toHaveLength(1))
    expect(inserted[0].shipper_id).toBeNull()

    await user.clear(shipperInput())
    await user.type(shipperInput(), 'binh')
    await user.click(await screen.findByRole('option', { name: 'Trần Văn Bình' }))
    await user.click(screen.getByTestId('inspection-save'))
    await waitFor(() => expect(inserted).toHaveLength(2))
    expect(inserted[1].shipper_id).toBe(2)
  })
})

describe('InspectionFormModal - dòng cũ chưa có số TK', () => {
  const oldRow = { id: 9, plan_id: null, tk_number: null, export_date: '2026-09-30' } as unknown as InspectionRow

  it('Sửa dòng cũ: để trống TK vẫn lưu được (plan_id null)', async () => {
    render(<InspectionFormModal row={oldRow} lookups={lookups} onClose={() => {}} onSaved={() => {}} />)
    await userEvent.click(screen.getByTestId('inspection-save'))
    await waitFor(() => expect(updated).toHaveLength(1))
    expect(updated[0].plan_id).toBeNull()
    expect(screen.queryByTestId('inspection-error')).toBeNull()
  })

  it('Sửa dòng có số TK: hiện tk_number từ dữ liệu dòng, không cần tải danh sách', () => {
    const row = { id: 9, plan_id: 7, tk_number: 'TK-1', export_date: '2026-09-30', receiving_unit_id: 4, receiving_unit_name: 'Kho Bình Chánh' } as unknown as InspectionRow
    render(<InspectionFormModal row={row} lookups={lookups} onClose={() => {}} onSaved={() => {}} />)
    expect((screen.getByTestId('tk') as HTMLInputElement).value).toBe('TK-1')
    expect((screen.getByTestId('receiving-unit') as HTMLInputElement).value).toBe('Kho Bình Chánh')
  })

  it('Thêm mới vẫn bắt buộc số TK', async () => {
    render(<InspectionFormModal row={null} lookups={lookups} onClose={() => {}} onSaved={() => {}} />)
    await userEvent.click(screen.getByTestId('inspection-save'))
    expect((await screen.findByTestId('inspection-error')).textContent).toContain('số phiếu thống kê')
    expect(inserted).toHaveLength(0)
  })

  it('Ctrl+Enter trong hộp thoại = Lưu', async () => {
    render(<InspectionFormModal row={oldRow} lookups={lookups} onClose={() => {}} onSaved={() => {}} />)
    await userEvent.click(screen.getByTestId('slip-no'))
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(updated).toHaveLength(1))
  })
})