// @vitest-environment jsdom
// T-025 (tester): bảng kiểm - số VN chặt, bấm lưu 2 lần, sửa dòng có TK rồi xóa TK, dòng cũ không TK.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  updated: [] as Record<string, unknown>[],
  delay: 0,
}))

vi.mock('../lib/supabase', () => {
  const plan = { id: 7, tk_number: 'TK-1', export_date: '2026-10-28', transport_order_no: '008784', vehicle: { name: '51D-44521' }, driver: { name: 'Lan' }, fg_exporter: null, material_exporters: [] }
  const chain = (data: unknown) => {
    const c: Record<string, unknown> = {
      then: (r: (v: unknown) => unknown) => r({ data, error: null }),
      maybeSingle: () => Promise.resolve({ data: plan, error: null }),
      insert: (p: Record<string, unknown>) => { h.inserted.push(p); return new Promise((r) => setTimeout(() => r({ error: null }), h.delay)) },
      update: (p: Record<string, unknown>) => { h.updated.push(p); return c },
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

const lookups = { byKind: () => [], loading: false, error: '', reload: async () => {} }

beforeAll(() => { HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
afterEach(() => { cleanup(); h.inserted.length = 0; h.updated.length = 0; h.delay = 0 })

async function openNewWithTk() {
  const user = userEvent.setup()
  render(<InspectionFormModal row={null} lookups={lookups} onClose={() => {}} onSaved={() => {}} />)
  await act(() => new Promise((r) => setTimeout(r, 20))) // chờ danh sách số TK
  await user.type(await screen.findByTestId('tk'), 'TK-1')
  await user.click(await screen.findByRole('option', { name: /TK-1/ }))
  return user
}
const err = () => screen.queryByTestId('inspection-error')?.textContent ?? ''

describe('InspectionFormModal - số kiểu VN', () => {
  it.each(['5.5', '1.23', '-3', 'abc', '1,2,3'])('khối lượng "%s" bị từ chối, không ghi DB', async (bad) => {
    const user = await openNewWithTk()
    await user.type(screen.getByTestId('weight'), bad)
    await user.click(screen.getByTestId('inspection-save'))
    expect(await screen.findByTestId('inspection-error')).toBeTruthy()
    expect(err()).toContain('Tổng khối lượng')
    expect(err()).toContain('Sai định dạng số')
    expect(h.inserted).toHaveLength(0)
  })

  it('số lượng sai → báo đúng ô "Số lượng xuất"', async () => {
    const user = await openNewWithTk()
    await user.type(screen.getByTestId('quantity'), '5.5')
    await user.click(screen.getByTestId('inspection-save'))
    expect((await screen.findByTestId('inspection-error')).textContent).toContain('Số lượng xuất')
    expect(h.inserted).toHaveLength(0)
  })

  it('"1.234,5" → 1234.5; "0" giữ nguyên 0 (không bị coi là trống); ô trống → null; chữ có khoảng trắng đầu/cuối được cắt', async () => {
    const user = await openNewWithTk()
    await user.type(screen.getByTestId('weight'), '1.234,5')
    await user.type(screen.getByTestId('quantity'), '0')
    await user.type(screen.getByTestId('slip-no'), '  PXK 001  ')
    await user.click(screen.getByTestId('inspection-save'))
    await waitFor(() => expect(h.inserted).toHaveLength(1))
    expect(h.inserted[0]).toMatchObject({ plan_id: 7, total_weight_kg: 1234.5, quantity: 0, warehouse_slip_no: 'PXK 001', note: null, work_item: null })
  })

  it('để trống cả hai ô số → null (không phải 0)', async () => {
    const user = await openNewWithTk()
    await user.click(screen.getByTestId('inspection-save'))
    await waitFor(() => expect(h.inserted).toHaveLength(1))
    expect(h.inserted[0]).toMatchObject({ quantity: null, total_weight_kg: null })
  })
})

describe('InspectionFormModal - bấm 2 lần / mất TK', () => {
  it('bấm Lưu 2 lần khi DB chậm → chỉ 1 dòng được ghi', async () => {
    h.delay = 80
    const user = await openNewWithTk()
    await user.dblClick(screen.getByTestId('inspection-save'))
    await act(() => new Promise((r) => setTimeout(r, 150)))
    expect(h.inserted).toHaveLength(1)
  })

  it('"Lưu và thêm dòng tiếp" bấm 2 lần liên tiếp → chỉ 1 dòng', async () => {
    h.delay = 80
    const user = await openNewWithTk()
    await user.dblClick(screen.getByTestId('inspection-save-next'))
    await act(() => new Promise((r) => setTimeout(r, 150)))
    expect(h.inserted).toHaveLength(1)
  })

  it('sửa dòng ĐÃ có TK rồi xóa ô TK → bị chặn (chỉ dòng cũ không TK mới được để trống)', async () => {
    const row = { id: 5, plan_id: 7, tk_number: 'TK-1', export_date: '2026-10-28' } as unknown as InspectionRow
    const user = userEvent.setup()
    render(<InspectionFormModal row={row} lookups={lookups} onClose={() => {}} onSaved={() => {}} />)
    await act(() => new Promise((r) => setTimeout(r, 20)))
    await user.clear(await screen.findByTestId('tk'))
    await user.click(screen.getByTestId('inspection-save'))
    expect((await screen.findByTestId('inspection-error')).textContent).toContain('số phiếu thống kê')
    expect(h.updated).toHaveLength(0)
  })
})
