import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { processImage, removeAvatar, saveAvatar } from '../lib/avatar'
import { messageOf } from '../lib/useAdminUsers'
import { useProfile } from '../lib/useProfile'
import Avatar from './ui/Avatar'
import Button from './ui/Button'
import { useToast } from './ui/Toast'
import { Shell as DialogShell } from './UserModals'

/** Đổi / gỡ ảnh đại diện CỦA CHÍNH MÌNH (`userId` = tài khoản đang đăng nhập; không ai, kể cả admin/root, đổi hộ được). Ảnh được cắt vuông + thu nhỏ trên máy trước khi tải lên. */
export default function AvatarDialog({ userId, name, path, onClose, onChanged }: {
  userId: string; name: string; path: string | null; onClose: () => void; onChanged?: () => void
}) {
  const toast = useToast()
  const { reload } = useProfile()
  const fileRef = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<{ blob: Blob; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked.url) }, [picked]) // thu hồi địa chỉ xem trước khi đổi ảnh / đóng

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // chọn lại cùng một tệp vẫn nhận
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const blob = await processImage(file)
      setPicked({ blob, url: URL.createObjectURL(blob) })
    } catch (err) {
      setError(messageOf(err))
    }
    setBusy(false)
  }

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true)
    setError('')
    try {
      await action()
      reload?.() // thanh bên cập nhật ngay
      onChanged?.()
      toast.success(done)
      onClose()
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }

  return (
    <DialogShell title="Ảnh đại diện" onClose={onClose} busy={busy} testId="avatar-dialog"
      footer={
        <>
          {path && !picked && (
            <Button variant="danger" className="mr-auto" disabled={busy} onClick={() => void run(() => removeAvatar(path), 'Đã gỡ ảnh đại diện')} data-testid="avatar-remove">Gỡ ảnh</Button>
          )}
          <Button onClick={onClose} disabled={busy} data-testid="avatar-cancel">Hủy</Button>
          <Button variant="primary" disabled={busy || !picked} onClick={() => picked && void run(() => saveAvatar(userId, picked.blob, path), 'Đã cập nhật ảnh đại diện')} data-testid="avatar-save">
            {busy && picked ? 'Đang lưu...' : 'Lưu ảnh'}
          </Button>
        </>
      }>
      <div className="flex flex-col items-center gap-3">
        {picked
          ? <img src={picked.url} alt="Ảnh mới" className="h-32 w-32 rounded-full object-cover ring-2 ring-stone-200" data-testid="avatar-preview" />
          : <Avatar name={name} path={path} className="h-32 w-32 text-5xl" />}
        <p className="text-center text-sm text-gray-700">Ảnh của <b>{name}</b>. Ảnh được tự cắt vuông ở giữa và thu nhỏ, nên chọn ảnh chân dung.</p>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => void onPick(e)} data-testid="avatar-file" />
        <Button disabled={busy} onClick={() => fileRef.current?.click()} data-testid="avatar-choose">{picked ? 'Chọn ảnh khác…' : 'Chọn ảnh từ máy…'}</Button>
        {error && <p role="alert" className="w-full rounded-card border border-danger-line bg-danger-soft p-2 text-danger" data-testid="avatar-error">{error}</p>}
      </div>
    </DialogShell>
  )
}
