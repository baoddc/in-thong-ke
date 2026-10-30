import { useState, type FormEvent } from 'react'
import { decideEditRequest, requestDetailEdit, requestPlanEdit } from '../lib/useEditRequests'
import { Shell } from './UserModals'
import Button from './ui/Button'
import { Field, inputClass } from './ui/Input'

const MAX_NOTE = 500

/** Hộp thoại một ô văn bản (lý do / ghi chú): kiểm phía client, lỗi hiện cạnh ô, khóa nút khi đang gửi. */
function TextModal({ title, intro, label, placeholder, required, submitLabel, danger, testId, submit, onClose, onDone }: {
  title: string; intro: string; label: string; placeholder: string; required: boolean; submitLabel: string; danger?: boolean; testId: string
  submit: (text: string) => Promise<void>; onClose: () => void; onDone: () => void
}) {
  const [text, setText] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    const invalid = required && !t ? `Vui lòng nhập ${label.toLowerCase()}.` : t.length > MAX_NOTE ? `${label} không quá ${MAX_NOTE} ký tự.` : ''
    setFieldError(invalid)
    if (invalid) return
    setBusy(true)
    setError('')
    try {
      await submit(t)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra. Vui lòng thử lại.')
      setBusy(false)
    }
  }

  return (
    <Shell title={title} onClose={onClose} busy={busy} testId={testId} onSubmit={(e) => void onSubmit(e)}
      footer={<>
        <Button onClick={onClose} disabled={busy} data-testid={`${testId}-cancel`}>Hủy</Button>
        <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={busy} data-testid={`${testId}-submit`}>{busy ? 'Đang gửi...' : submitLabel}</Button>
      </>}>
      <p className="text-sm text-gray-700">{intro}</p>
      <Field label={required ? `${label} *` : label} error={fieldError} hint={`${text.trim().length}/${MAX_NOTE} ký tự`}>
        <textarea className={inputClass} rows={3} value={text} placeholder={placeholder} aria-invalid={!!fieldError}
          onChange={(e) => setText(e.target.value)} data-testid={`${testId}-text`} />
      </Field>
      {error && <p role="alert" className="rounded-card border border-danger-line bg-danger-soft p-2 text-sm text-danger" data-testid={`${testId}-error`}>{error}</p>}
    </Shell>
  )
}

/** Người tạo xin sửa phiếu (D-019) hoặc dòng bảng kiểm (D-020) quá 24 giờ. `label` vd "phiếu TK0001", "dòng bảng kiểm TK0001 / PXK 12". */
export function EditRequestModal({ planId, detailId, label, onClose, onDone }: { planId?: number; detailId?: number; label: string; onClose: () => void; onDone: () => void }) {
  const line = detailId !== undefined
  return (
    <TextModal title={`Yêu cầu sửa ${label}`}
      intro={line ? 'Dòng đã quá 24 giờ. Admin duyệt xong, bạn được sửa dòng này trong 24 giờ.' : 'Phiếu đã quá 24 giờ. Admin duyệt xong, bạn được sửa phiếu này và các dòng bảng kiểm do bạn tạo trong 24 giờ.'}
      label="Lý do" placeholder={line ? 'Vì sao cần sửa dòng này?' : 'Vì sao cần sửa phiếu này?'} required submitLabel="Gửi yêu cầu" testId="edit-request-modal"
      submit={(reason) => (line ? requestDetailEdit(detailId, reason) : requestPlanEdit(planId ?? 0, reason))} onClose={onClose} onDone={onDone} />
  )
}

/** Admin/root duyệt hoặc từ chối, ghi chú tùy chọn. */
export function DecideModal({ id, label, line, approve, onClose, onDone }: { id: number; label: string; line: boolean; approve: boolean; onClose: () => void; onDone: () => void }) {
  return (
    <TextModal title={`${approve ? 'Duyệt' : 'Từ chối'} yêu cầu sửa ${label}?`}
      intro={approve
        ? (line ? 'Người tạo được sửa dòng này trong 24 giờ kể từ lúc duyệt (không được xóa).' : 'Người tạo được sửa phiếu và các dòng bảng kiểm do họ tạo trong 24 giờ kể từ lúc duyệt (không được xóa).')
        : (line ? 'Người tạo sẽ không được sửa dòng quá 24 giờ.' : 'Người tạo sẽ không được sửa phiếu quá 24 giờ.')}
      label="Ghi chú" placeholder="Ghi chú (không bắt buộc)" required={false} submitLabel={approve ? 'Duyệt' : 'Từ chối'} danger={!approve} testId="decide-modal"
      submit={(note) => decideEditRequest(id, approve, note)} onClose={onClose} onDone={onDone} />
  )
}
