import { afterEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } } }))

import { pushToSheet } from './sheetSync'

afterEach(() => { invoke.mockReset(); vi.restoreAllMocks() })

describe('pushToSheet', () => {
  it('gọi Edge Function sheets-sync', () => {
    invoke.mockResolvedValue({ data: { configured: true, pushed: 1 }, error: null })
    pushToSheet()
    expect(invoke).toHaveBeenCalledWith('sheets-sync', { body: {} })
  })

  it('lỗi từ máy chủ hoặc lỗi mạng chỉ ghi console, không ném ra làm hỏng việc lưu', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    expect(() => pushToSheet()).not.toThrow()
    invoke.mockRejectedValueOnce(new Error('mạng'))
    expect(() => pushToSheet()).not.toThrow()
    invoke.mockImplementationOnce(() => { throw new Error('đồng bộ') })
    expect(() => pushToSheet()).not.toThrow()
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(3))
  })
})
