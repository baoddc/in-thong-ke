import { useEffect, useRef } from 'react'
import Button from './Button'
import Icon from './Icon'

type Props = {
  title: string
  message: string
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// Chỉ mount khi cần hỏi (giống các modal khác). Nút Hủy đứng trước nên được focus mặc định → Enter không xóa nhầm.
export default function ConfirmDialog({ title, message, confirmLabel = 'Xóa', busy, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])

  return (
    <dialog ref={ref} aria-labelledby="confirm-title" aria-describedby="confirm-message" data-testid="confirm-dialog"
      onCancel={(e) => { e.preventDefault(); if (!busy) onCancel() }}
      className="w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl p-0 shadow-2xl backdrop:bg-slate-900/60">
      <div className="flex gap-3 p-4">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger"><Icon name="alert" /></span>
        <div className="min-w-0 space-y-1">
          <h2 id="confirm-title" className="text-lg font-bold">{title}</h2>
          <p id="confirm-message" className="text-gray-700">{message}</p>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-stone-200 bg-surface p-3">
        <Button autoFocus onClick={onCancel} disabled={busy} data-testid="confirm-cancel">Hủy</Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy} data-testid="confirm-ok">{busy ? 'Đang xử lý...' : confirmLabel}</Button>
      </div>
    </dialog>
  )
}
