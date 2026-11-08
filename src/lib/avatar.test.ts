// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { upload, remove, rpc } = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), rpc: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { storage: { from: () => ({ upload, remove }) }, rpc } }))

import { avatarObjectPath, avatarUrl, cropRect, processImage, removeAvatar, saveAvatar } from './avatar'

const UID = '55685746-d53a-4cc0-a8c6-13d3ece84f79'
const webp = new Blob(['x'], { type: 'image/webp' })

beforeEach(() => {
  upload.mockReset().mockResolvedValue({ error: null })
  remove.mockReset().mockResolvedValue({ error: null })
  rpc.mockReset().mockResolvedValue({ error: null })
})

describe('đường dẫn + cắt ảnh', () => {
  it('đường dẫn khớp ràng buộc DB (<uuid>/<mili-giây>.webp|jpg) và địa chỉ công khai', () => {
    const rx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9]{10,16}\.(webp|jpg)$/
    expect(avatarObjectPath(UID, 'webp', 1794000000000)).toBe(`${UID}/1794000000000.webp`)
    expect(rx.test(avatarObjectPath(UID, 'jpg'))).toBe(true)
    expect(avatarUrl(`${UID}/1.webp`)).toMatch(/\/storage\/v1\/object\/public\/avatars\/55685746-.*\/1\.webp$/)
  })

  it('cắt hình vuông chính giữa: ảnh ngang cắt hai bên, ảnh dọc cắt trên dưới, ảnh vuông giữ nguyên', () => {
    expect(cropRect(1000, 500)).toEqual({ sx: 250, sy: 0, side: 500 })
    expect(cropRect(500, 1000)).toEqual({ sx: 0, sy: 250, side: 500 })
    expect(cropRect(300, 300)).toEqual({ sx: 0, sy: 0, side: 300 })
  })

  it('từ chối tệp không phải ảnh hoặc quá lớn, trước khi đọc ảnh', async () => {
    await expect(processImage(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).rejects.toThrow('JPG, PNG hoặc WebP')
    const big = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    Object.defineProperty(big, 'size', { value: 9 * 1024 * 1024 })
    await expect(processImage(big)).rejects.toThrow('quá lớn')
  })
})

describe('saveAvatar / removeAvatar', () => {
  it('tải lên → gắn vào hồ sơ → xóa ảnh cũ, theo đúng thứ tự', async () => {
    const order: string[] = []
    upload.mockImplementation(async () => { order.push('upload'); return { error: null } })
    rpc.mockImplementation(async () => { order.push('rpc'); return { error: null } })
    remove.mockImplementation(async () => { order.push('remove'); return { error: null } })
    const path = await saveAvatar(UID, webp, `${UID}/1.webp`)
    expect(path).toMatch(new RegExp(`^${UID}/\\d{13}\\.webp$`))
    expect(upload).toHaveBeenCalledWith(path, webp, expect.objectContaining({ contentType: 'image/webp' }))
    expect(rpc).toHaveBeenCalledWith('set_avatar', { p_path: path }) // không có tham số "đổi cho ai": DB chỉ đổi cho người đang đăng nhập
    expect(remove).toHaveBeenCalledWith([`${UID}/1.webp`])
    expect(order).toEqual(['upload', 'rpc', 'remove'])
  })

  it('ảnh JPEG lưu đuôi .jpg; chưa có ảnh cũ thì không xóa gì', async () => {
    const path = await saveAvatar(UID, new Blob(['x'], { type: 'image/jpeg' }), null)
    expect(path.endsWith('.jpg')).toBe(true)
    expect(remove).not.toHaveBeenCalled()
  })

  it('tải lên lỗi: không gắn vào hồ sơ; gắn lỗi: xóa tệp vừa tải, giữ ảnh cũ', async () => {
    upload.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } })
    await expect(saveAvatar(UID, webp, `${UID}/1.webp`)).rejects.toThrow('Bạn không có quyền đổi ảnh này.')
    expect(rpc).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()

    upload.mockResolvedValue({ error: null })
    rpc.mockResolvedValue({ error: { code: '42501', message: 'x' } })
    await expect(saveAvatar(UID, webp, `${UID}/1.webp`)).rejects.toThrow('không có quyền')
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).not.toHaveBeenCalledWith([`${UID}/1.webp`]) // ảnh cũ còn nguyên
  })

  it('gỡ ảnh: bỏ liên kết trước, rồi xóa tệp; lỗi thì giữ tệp', async () => {
    await removeAvatar(`${UID}/1.webp`)
    expect(rpc).toHaveBeenCalledWith('set_avatar', { p_path: null })
    expect(remove).toHaveBeenCalledWith([`${UID}/1.webp`])
    remove.mockClear()
    rpc.mockResolvedValue({ error: { message: 'lỗi' } })
    await expect(removeAvatar(`${UID}/1.webp`)).rejects.toThrow()
    expect(remove).not.toHaveBeenCalled()
  })
})
