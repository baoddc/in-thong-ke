// @vitest-environment jsdom
// T-025 (tester): luồng tạo/sửa phiếu gọi RPC đúng tham số, thứ tự NV xuất VT, bấm 2 lần, lỗi máy chủ.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  result: { data: { tk_number: 'TK2026/10-005' } as unknown, error: null as null | { code?: string; message: string } },
  delay: 0,
  hold: [] as string[], // reserve_tk_number / release_tk_reservation đã gọi
  lookups: [] as { id: number; kind: string; name: string }[],
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === 'reserve_tk_number' || fn === 'release_tk_reservation') {
        h.hold.push(fn)
        return Promise.resolve({ data: fn === 'reserve_tk_number' ? 'TK2026/10-005' : null, error: null })
      }
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
beforeEach(() => { h.calls.length = 0; h.hold.length = 0; h.result = { data: { tk_number: 'TK2026/10-005' }, error: null }; h.delay = 0 })
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

describe('PlanFormModal - giữ chỗ số TK (D-018)', () => {
  it('mở thêm mới → gọi reserve và hiện số + chú thích; đóng không lưu → release', async () => {
    const { unmount } = render(<PlanFormModal plan={null} lookups={lookups} onClose={() => {}} onSaved={() => {}} />)
    await waitFor(() => expect((screen.getByTestId('tk-number') as HTMLInputElement).value).toBe('TK2026/10-005'))
    expect(h.hold).toEqual(['reserve_tk_number'])
    expect(screen.getByTestId('tk-hold-note').textContent).toContain('Số này được giữ cho bạn trong 5 phút')
    unmount()
    expect(h.hold).toEqual(['reserve_tk_number', 'release_tk_reservation'])
  })

  it('lưu xong → không gọi release thừa; số trùng số đã giữ → toast thường', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<PlanFormModal plan={null} lookups={lookups} onClose={() => {}} onSaved={vi.fn()} />)
    await waitFor(() => expect((screen.getByTestId('tk-number') as HTMLInputElement).value).toBe('TK2026/10-005'))
    await user.click(screen.getByTestId('plan-save'))
    await waitFor(() => expect(h.calls).toHaveLength(1))
    unmount()
    expect(h.hold).toEqual(['reserve_tk_number'])
  })

  it('số lưu khác số đã giữ → báo đã đổi số', async () => {
    h.result = { data: { tk_number: 'TK2026/10-009' }, error: null }
    const user = userEvent.setup()
    const onSaved = vi.fn()
    render(<PlanFormModal plan={null} lookups={lookups} onClose={() => {}} onSaved={onSaved} />)
    await waitFor(() => expect((screen.getByTestId('tk-number') as HTMLInputElement).value).toBe('TK2026/10-005'))
    await user.click(screen.getByTestId('plan-save'))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Số phiếu đã đổi thành TK2026/10-009 do hết thời gian giữ'))
  })

  it('lưu lỗi → vẫn giữ chỗ (chưa release)', async () => {
    h.result = { data: null, error: { code: 'P0001', message: 'lỗi' } }
    const user = userEvent.setup()
    render(<PlanFormModal plan={null} lookups={lookups} onClose={() => {}} onSaved={vi.fn()} />)
    await waitFor(() => expect((screen.getByTestId('tk-number') as HTMLInputElement).value).toBe('TK2026/10-005'))
    await user.click(screen.getByTestId('plan-save'))
    await screen.findByTestId('plan-error')
    expect(h.hold).toEqual(['reserve_tk_number'])
  })

  it('chế độ Sửa không gọi reserve/release', () => {
    const plan = { id: 7, tk_number: 'TK2026/10-001', export_date: '2026-10-28', material_exporters: [] } as unknown as PlanRow
    const { unmount } = render(<PlanFormModal plan={plan} lookups={lookups} onClose={() => {}} onSaved={vi.fn()} />)
    unmount()
    expect(h.hold).toEqual([])
  })

  describe('đồng hồ đếm ngược', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })
    const timer = () => screen.getByTestId('tk-hold-timer').textContent
    const advance = (s: number) => act(async () => { await vi.advanceTimersByTimeAsync(s * 1000) })

    it('đếm 05:00 → hết giờ hiện thông báo, không gia hạn khi không thao tác', async () => {
      render(<PlanFormModal plan={null} lookups={lookups} onClose={() => {}} onSaved={vi.fn()} />)
      await advance(0)
      expect(timer()).toBe('05:00')
      await advance(65)
      expect(timer()).toBe('03:55')
      await advance(235)
      expect(screen.getByTestId('tk-hold-expired').textContent).toContain('Đã hết thời gian giữ số, số sẽ được cấp lại khi lưu')
      expect(h.hold.filter((f) => f === 'reserve_tk_number')).toHaveLength(1)
      expect((screen.getByTestId('plan-save') as HTMLButtonElement).disabled).toBe(false)
    })

    it('còn ≤ 1 phút và người dùng đang thao tác → gọi reserve lại, đồng hồ về 05:00', async () => {
      render(<PlanFormModal plan={null} lookups={lookups} onClose={() => {}} onSaved={vi.fn()} />)
      await advance(0)
      await advance(250)
      fireEvent.input(screen.getByTestId('order-no'), { target: { value: '1' } })
      await advance(2)
      expect(h.hold.filter((f) => f === 'reserve_tk_number')).toHaveLength(2)
      expect(timer()).toMatch(/^0(5:00|4:59)$/) // mốc đếm lại từ lúc gia hạn
    })
  })
})

describe('PlanFormModal - bố cục', () => {
  const plan = { id: 7, tk_number: 'TK2026/10-001', export_date: '2026-10-28', material_exporters: [] } as unknown as PlanRow
  it.each([false, true])('vùng cuộn là div (min-h-0 + overflow-y-auto), fieldset không cuộn, header/chân shrink-0 (readOnly=%s)', (readOnly) => {
    render(<PlanFormModal plan={plan} readOnly={readOnly} lookups={lookups} onClose={() => {}} onSaved={vi.fn()} />)
    const body = screen.getByTestId('modal-body')
    expect(body.className).toMatch(/\bmin-h-0\b/)
    expect(body.className).toMatch(/\boverflow-y-auto\b/)
    const fieldset = body.querySelector('fieldset')!
    expect(fieldset.className).toMatch(/\bmin-w-0\b/)
    expect(fieldset.className).not.toMatch(/overflow/)
    expect(screen.getByTestId('plan-cancel').parentElement!.className).toMatch(/\bshrink-0\b/)
    expect(screen.getByTestId('plan-close').parentElement!.className).toMatch(/\bshrink-0\b/)
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
