import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { maskDateInput, parseDisplayDate } from '../../lib/date'
import { formatDate } from '../../lib/format'
import Icon from './Icon'
import { inputClass, inputSmClass } from './Input'

const CAN_PICK = typeof HTMLInputElement !== 'undefined' && 'showPicker' in HTMLInputElement.prototype
const INVALID = 'Ngày không hợp lệ. Nhập theo dạng dd/mm/yyyy.'

type Props = {
  value: string // ISO yyyy-mm-dd, "" = chưa chọn
  onChange: (iso: string) => void // gọi với ISO hợp lệ, hoặc "" khi để trống/gõ sai
  min?: string // ISO, chỉ giới hạn lịch chọn
  max?: string
  required?: boolean
  disabled?: boolean
  className?: string
  inputSize?: 'md' | 'sm'
  'data-testid'?: string
}

/** Ô ngày dd/mm/yyyy: tự chèn "/", kiểm ngày có thật, kèm nút lịch (nếu trình duyệt hỗ trợ). Giá trị vào/ra là ISO. */
const DateInput = forwardRef<HTMLInputElement, Props>(function DateInput({ value, onChange, min, max, required, disabled, className = '', inputSize, 'data-testid': testId }, ref) {
  const sm = inputSize === 'sm'
  const textRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => textRef.current as HTMLInputElement)
  const [text, setText] = useState(() => formatDate(value))
  const [touched, setTouched] = useState(false)

  // Giá trị đổi từ ngoài (xóa bộ lọc, chọn từ lịch) → hiện theo giá trị đó; còn lại giữ nguyên chữ đang gõ.
  const parsed = parseDisplayDate(text)
  const synced = parsed === value || (parsed === null && value === '')
  const shown = synced ? text : formatDate(value)
  const invalid = shown !== '' && parseDisplayDate(shown) === null
  const showError = invalid && (touched || shown.length >= 10)

  // Chặn gửi form khi ngày sai (kể cả nút "Lưu và thêm dòng tiếp" gọi reportValidity).
  useEffect(() => { textRef.current?.setCustomValidity(invalid ? INVALID : '') })

  const emit = (iso: string) => { if (iso !== value) onChange(iso) }

  return (
    <span className={`block ${className}`}>
      <span className={`relative block ${sm ? '' : 'mt-1'}`}>
        <input ref={textRef} type="text" inputMode="numeric" autoComplete="off" placeholder="dd/mm/yyyy" maxLength={10}
          value={shown} required={required} disabled={disabled} aria-invalid={showError} data-testid={testId}
          onChange={(e) => {
            const next = maskDateInput(e.target.value)
            setText(next)
            emit(parseDisplayDate(next) ?? '')
          }}
          onBlur={() => {
            setTouched(true)
            if (parsed) setText(formatDate(parsed)) // "1/2/2026" → "01/02/2026"
          }}
          className={`${inputClass} !mt-0 ${sm ? inputSmClass : ''} ${CAN_PICK ? 'pr-11' : ''}`} />
        {CAN_PICK && !disabled && (
          <>
            <button type="button" aria-label="Chọn ngày từ lịch" title="Chọn ngày từ lịch" data-testid={testId ? `${testId}-calendar` : undefined}
              onClick={() => { try { pickerRef.current?.showPicker() } catch { /* trình duyệt từ chối: vẫn gõ tay được */ } }}
              className="absolute inset-y-1 right-1 flex w-9 items-center justify-center rounded-md text-gray-600 transition duration-150 hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <Icon name="calendar" size={18} />
            </button>
            <input ref={pickerRef} type="date" tabIndex={-1} aria-hidden="true" value={value} min={min} max={max}
              onChange={(e) => emit(e.target.value)}
              className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0" />
          </>
        )}
      </span>
      {showError && <span role="alert" className="mt-0.5 block text-sm font-normal text-danger" data-testid={testId ? `${testId}-error` : undefined}>{INVALID}</span>}
    </span>
  )
})

export default DateInput
