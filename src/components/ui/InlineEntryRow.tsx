import { useEffect, type MutableRefObject, type ReactNode } from 'react'
import Button, { IconButton } from './Button'

/** Hành động của dòng nhập, trang gọi từ nút trên PageHeader (cùng validate/confirm như Enter/Esc). */
// save: true = đã lưu xong (chỉ dòng có `onSave` trả kết quả — Bảng kiểm; dòng khác luôn false). cancel: true = đã đóng (người dùng đồng ý bỏ / không có gì để bỏ)
export type InlineControls = { save: () => Promise<boolean>; cancel: () => boolean }

type Props = {
  saveLabel: string // "Lưu phiếu" / "Lưu dòng"
  controlsRef?: MutableRefObject<InlineControls | null>
  onBusy?: (busy: boolean) => void
  columnKeys: string[] // đúng thứ tự cột của bảng; cột không có trong `cells` để trống
  cells: Record<string, ReactNode>
  error: string
  busy: boolean
  dirty: boolean
  onSave: () => void | Promise<boolean | void>
  onCancel: () => void
  extraActions?: ReactNode // nút thêm cạnh Lưu/Hủy trong ô Thao tác (vd "+ thêm dòng bên dưới")
  testId: string
  cellTitle?: (key: string) => string | undefined
  onFocusCell?: (key: string) => void // ô đang đứng (D-025: người khác thấy khung ô)
}

/** Dòng nhập đầu bảng kiểu Google Sheets: Tab đổi ô, Enter lưu, Esc hủy (khi danh sách gợi ý đang mở thì Enter/Esc thuộc về ô đó). */
export default function InlineEntryRow({ columnKeys, cells, error, busy, dirty, onSave, onCancel, testId, cellTitle, onFocusCell, saveLabel, controlsRef, onBusy, extraActions }: Props) {
  function cancel() {
    if (busy) return false
    if (dirty && !window.confirm('Bỏ các thay đổi chưa lưu?')) return false
    onCancel()
    return true
  }
  useEffect(() => {
    if (controlsRef) controlsRef.current = { save: async () => (busy ? false : (await onSave()) === true), cancel }
  })
  useEffect(() => {
    onBusy?.(busy)
    return () => onBusy?.(false)
  }, [busy, onBusy])
  useEffect(() => () => { if (controlsRef) controlsRef.current = null }, [controlsRef])

  return (
    <>
      <tr data-testid={testId} className="bg-amber-50"
        onKeyDown={(e) => {
          if (e.defaultPrevented) return // ô gợi ý đang mở đã xử lý phím này
          if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button')) { e.preventDefault(); if (!busy) onSave() }
          else if (e.key === 'Escape') { e.preventDefault(); cancel() }
        }}>
        {columnKeys.map((k, i) => (
          <td key={k} title={cellTitle?.(k)} onFocus={() => onFocusCell?.(k)} className={`px-2 py-1.5 align-top ${i === 0 ? 'sticky left-0 bg-inherit' : ''} ${k === 'actions' ? 'whitespace-nowrap' : 'min-w-[9rem]'}`}>
            {k === 'actions' ? (
              <span className="inline-flex items-center gap-0.5">
                <Button variant="primary" size="sm" disabled={busy} onClick={onSave} data-testid={`${testId}-save`}>{saveLabel}</Button>
                <IconButton icon="close" label="Hủy dòng" disabled={busy} onClick={cancel} data-testid={`${testId}-cancel`} />
                {extraActions}
              </span>
            ) : cells[k]}
          </td>
        ))}
      </tr>
      {error && (
        <tr className="bg-amber-50">
          <td colSpan={columnKeys.length} className="px-2 pb-2">
            <p role="alert" className="rounded-card border border-danger-line bg-danger-soft p-2 text-danger" data-testid={`${testId}-error`}>{error}</p>
          </td>
        </tr>
      )}
    </>
  )
}
