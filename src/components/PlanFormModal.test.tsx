// @vitest-environment jsdom
// T-025 (tester): luồng tạo/sửa phiếu gọi RPC đúng tham số, thứ tự NV xuất VT, bấm 2 lần, lỗi máy chủ.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  result: { data: { tk_number: 'TK2026/10-005' } as unknown, error: null as null | { code?: string; message: string } },
  delay: 0,
  lookups: [] as { id: number; kind: string; name: string }[],
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === 'next_tk_number') return Promise.resolve({ data: 'TK2026/10-005', error: null })
      if (fn === 'search_lookup_items') { // danh mục lớn (xe, tài xế) tìm phía server
        const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        return Promise.resolve({ data: h.lookups.filter((i) => i.kind === args.p_kind && norm(i.name).includes(norm(String(args.p_q)))), error: null })
      }
      h.calls.push({ fn, args })
      return new Promise((r) => setTimeout(() => r(h.result), h.delay))
    },
  },
}))

import PlanFormModal from './PlanFormModal'
import type { PlanRow } from '../types/plan'

const it_ = (id: number, kind: string, name: string) => ({ id, kind, name, code: null, created_at: '', updated_at: '' })
const items = [
  it_(11, 'material_exporter', 'An'), it_(12, 'material_exporter', 'Bình'), it_(13, 'material_exporter', 'Chi'),
  it_(21, 'vehicle', '51D-44521'), it_(31, 'driver', 'Phạm Minh Luân'),
]
h.lookups = items
const lookups = { byKind: (k: string) => items.filter((i) => i.kind === k), loading: false, error: '', reload: async () => {} }

beforeAll(() => { HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
beforeEach(() => { h.calls.length = 0; h.result = { data: { tk_number: 'TK2026/10-005' }, error: null }; h.delay = 0 })
afterEach(cleanup)

const mount = (plan: PlanRow | null = null, onSaved = vi.fn()) => {
  render(<PlanFormModal plan={plan} lookups={lookups} onClose={() => {}} onSaved={onSaved} />)
  return onSaved
}
const typeDate = async (user: ReturnType<typeof userEvent.setup>, digits: string) => {
  const d = screen.getByTestId('export-date')
  await user.clear(d)
  await user.type(d, digits)
}
async function pick(user: ReturnType<typeof userEvent.setup>, testId: string, query: string, option: string) {
  await user.type(screen.getByTestId(testId), query)
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('PlanFormModal - tạo phiếu', () => {
  it('gọi create_transport_plan đúng tham số; NV xuất VT giữ thứ tự chọn (Bình trước An); trim ô text', async () => {
    const user = userEvent.setup()
    const onSaved = mount()
    await typeDate(user, '29022028') // ngày nhuận
    await user.type(screen.getByTestId('order-no'), '  008784  ')
    await pick(user, 'vehicle', '44521', '51D-44521')
    await pick(user, 'driver', 'luan', 'Phạm Minh Luân')
    await pick(user, 'material-exporters', 'binh', 'Bình')
    await pick(user, 'material-exporters', 'an', 'An')
    await user.type(screen.getByTestId('note'), '   ')
    await user.click(screen.getByTestId('plan-save'))
    await waitFor(() => expect(h.calls).toHaveLength(1))
    expect(h.calls[0]).toEqual({
      fn: 'create_transport_plan',
      args: {
        p_export_date: '2028-02-29', p_transport_order_no: '008784', p_transport_type_id: null, p_vehicle_id: 21,
        p_driver_id: 31, p_fg_exporter_id: null, p_material_exporter_ids: [12, 11], p_note: null,
      },
    })
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Đã lưu phiếu TK2026/10-005'))
  })

  it('ngày xuất sai (31/02) → không gọi RPC', async () => {
    const user = userEvent.setup()
    mount()
    await typeDate(user, '31022026')
    await user.click(screen.getByTestId('plan-save'))
    expect(h.calls).toHaveLength(0)
    expect(screen.getByTestId('export-date-error').textContent).toContain('Ngày không hợp lệ')
  })

  it('để trống ngày xuất → không gọi RPC', async () => {
    const user = userEvent.setup()
    mount()
    await user.clear(screen.getByTestId('export-date'))
    fireEvent.submit(screen.getByTestId('plan-form')) // bỏ qua kiểm tra native để thử luôn lớp kiểm trong submit()
    expect((await screen.findByTestId('plan-error')).textContent).toContain('chọn ngày xuất')
    expect(h.calls).toHaveLength(0)
  })

  it('bấm Lưu 2 lần liên tiếp (RPC chậm) → chỉ 1 lời gọi', async () => {
    h.delay = 80
    const user = userEvent.setup()
    mount()
    const save = screen.getByTestId('plan-save')
    await user.dblClick(save)
    await act(() => new Promise((r) => setTimeout(r, 150)))
    expect(h.calls).toHaveLength(1)
  })

  it('chữ gõ dở ở ô chọn (chưa chọn từ danh mục) → chặn lưu', async () => {
    const user = userEvent.setup()
    mount()
    await user.type(screen.getByTestId('vehicle'), 'khong-co-xe-nay')
    await user.click(screen.getByTestId('plan-save'))
    expect((await screen.findByTestId('plan-error')).textContent).toContain('chưa chọn từ danh mục')
    expect(h.calls).toHaveLength(0)
  })

  it('RPC báo hết số phiếu → hiện lỗi tiếng Việt, không đóng modal, nút Lưu bấm lại được', async () => {
    h.result = { data: null, error: { code: 'P0001', message: 'Đã hết số phiếu thống kê trong tháng 10/2026' } }
    const user = userEvent.setup()
    const onSaved = mount()
    await user.click(screen.getByTestId('plan-save'))
    expect((await screen.findByTestId('plan-error')).textContent).toContain('Đã hết số phiếu thống kê')
    expect(onSaved).not.toHaveBeenCalled()
    expect((screen.getByTestId('plan-save') as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('PlanFormModal - sửa phiếu', () => {
  const plan = {
    id: 7, tk_number: 'TK2026/10-001', export_date: '2026-10-28', transport_order_no: 'L1', transport_type_id: null,
    vehicle_id: null, driver_id: null, fg_exporter_id: null, note: null, transport_type: null, vehicle: null, driver: null, fg_exporter: null,
    material_exporters: [{ sort_order: 1, lookup: { id: 11, name: 'An' } }, { sort_order: 0, lookup: { id: 12, name: 'Bình' } }],
  } as PlanRow

  it('gọi update_transport_plan với p_id, giữ ngày + thứ tự NV xuất VT theo sort_order', async () => {
    const user = userEvent.setup()
    const onSaved = mount(plan)
    expect((screen.getByTestId('tk-number') as HTMLInputElement).value).toBe('TK2026/10-001')
    await user.click(screen.getByTestId('plan-save'))
    await waitFor(() => expect(h.calls).toHaveLength(1))
    expect(h.calls[0].fn).toBe('update_transport_plan')
    expect(h.calls[0].args).toMatchObject({ p_id: 7, p_export_date: '2026-10-28', p_transport_order_no: 'L1', p_material_exporter_ids: [12, 11] })
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Đã cập nhật phiếu TK2026/10-001'))
  })
})
