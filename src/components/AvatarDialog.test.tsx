// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const processImage = vi.fn()
const saveAvatar = vi.fn()
const removeAvatar = vi.fn()
const reload = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }
vi.mock('../lib/avatar', async (orig) => ({ ...(await orig<typeof import('../lib/avatar')>()), processImage: (f: File) => processImage(f), saveAvatar: (...a: unknown[]) => saveAvatar(...a), removeAvatar: (...a: unknown[]) => removeAvatar(...a) }))
vi.mock('../lib/useProfile', () => ({ useProfile: () => ({ profile: { id: 'me' }, reload }) }))
vi.mock('./ui/Toast', () => ({ useToast: () => toast }))

import AvatarDialog from './AvatarDialog'

const blob = new Blob(['x'], { type: 'image/webp' })
const file = new File(['x'], 'a.png', { type: 'image/png' })
const pick = () => fireEvent.change(screen.getByTestId('avatar-file'), { target: { files: [file] } })

beforeEach(() => {
  vi.clearAllMocks()
  processImage.mockResolvedValue(blob)
  saveAvatar.mockResolvedValue('me/1.webp')
  removeAvatar.mockResolvedValue(undefined)
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) { this.setAttribute('open', '') }
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})
afterEach(cleanup)

describe('AvatarDialog', () => {
  it('chọn ảnh → xem trước → Lưu: tải lên, làm mới hồ sơ của chính mình, báo thành công, đóng', async () => {
    const onClose = vi.fn(), onChanged = vi.fn()
    render(<AvatarDialog userId="me" name="Lê Thái Bão" path="me/0.webp" onClose={onClose} onChanged={onChanged} />)
    expect((screen.getByTestId('avatar-save') as HTMLButtonElement).disabled).toBe(true) // chưa chọn ảnh
    expect(screen.getByTestId('avatar-remove')).toBeTruthy()
    pick()
    await screen.findByTestId('avatar-preview')
    expect(screen.queryByTestId('avatar-remove')).toBeNull() // đang xem ảnh mới: ẩn nút Gỡ
    fireEvent.click(screen.getByTestId('avatar-save'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(saveAvatar).toHaveBeenCalledWith('me', blob, 'me/0.webp')
    expect(reload).toHaveBeenCalledTimes(1)
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Đã cập nhật ảnh đại diện')
  })

  it('ảnh không hợp lệ hoặc tải lên lỗi: hiện lỗi, không đóng hộp thoại', async () => {
    const onClose = vi.fn()
    processImage.mockRejectedValueOnce(new Error('Chỉ nhận ảnh JPG, PNG hoặc WebP.'))
    render(<AvatarDialog userId="me" name="Bão" path={null} onClose={onClose} />)
    pick()
    expect((await screen.findByTestId('avatar-error')).textContent).toContain('JPG, PNG')
    pick() // chọn lại ảnh hợp lệ
    await screen.findByTestId('avatar-preview')
    saveAvatar.mockRejectedValueOnce(new Error('Bạn không có quyền đổi ảnh này.'))
    fireEvent.click(screen.getByTestId('avatar-save'))
    await waitFor(() => expect(screen.getByTestId('avatar-error').textContent).toContain('không có quyền'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Gỡ ảnh: gọi removeAvatar với ảnh hiện tại rồi đóng', async () => {
    const onClose = vi.fn()
    render(<AvatarDialog userId="me" name="Bão" path="me/0.webp" onClose={onClose} />)
    fireEvent.click(screen.getByTestId('avatar-remove'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(removeAvatar).toHaveBeenCalledWith('me/0.webp')
    expect(toast.success).toHaveBeenCalledWith('Đã gỡ ảnh đại diện')
  })
})
