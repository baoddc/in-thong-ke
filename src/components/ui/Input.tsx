import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

export const inputClass =
  'mt-1 block w-full min-h-10 rounded-lg border border-line bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500 transition duration-150 hover:border-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary disabled:bg-gray-100 aria-[invalid=true]:border-danger'

/** Nhãn của ô nhập trong form. */
export const labelClass = 'block text-sm font-medium text-gray-800'

/** Cỡ nhỏ cho thanh lọc: cao 36px trên máy tính (điện thoại vẫn ≥ 40px), không lề trên. Mặc định (form/modal) không đổi. */
export const inputSmClass = '!mt-0 !py-1 text-sm sm:!min-h-9'

/** Nhãn nổi nhỏ nằm trên viền ô (không chiếm chiều cao) — dùng với ô cỡ sm. */
export const floatLabelClass = 'pointer-events-none absolute left-2 top-0 z-10 -translate-y-1/2 bg-white px-1 text-xs font-medium leading-none text-gray-700'

type Size = 'md' | 'sm'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { inputSize?: Size }>(function Input({ className = '', inputSize, ...rest }, ref) {
  return <input ref={ref} className={`${inputClass} ${inputSize === 'sm' ? inputSmClass : ''} ${className}`} {...rest} />
})

export function Select({ className = '', inputSize, ...rest }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & { inputSize?: Size }) {
  return <select className={`${inputClass} ${inputSize === 'sm' ? inputSmClass : ''} ${className}`} {...rest} />
}

/** Nhãn + ô nhập + gợi ý/lỗi cạnh ô; nhãn gắn với ô nhập qua <label>. `compact`: nhãn nổi trên viền ô. */
export function Field({ label, hint, error, className = '', compact, children }: { label: string; hint?: string; error?: string; className?: string; compact?: boolean; children: ReactNode }) {
  return (
    <label className={compact ? `relative block ${className}` : `${labelClass} ${className}`}>
      {compact ? <span className={floatLabelClass}>{label}</span> : label}
      {children}
      {hint && !error && <span className="mt-0.5 block text-sm font-normal text-muted">{hint}</span>}
      {error && <span role="alert" className="mt-0.5 block text-sm font-normal text-danger">{error}</span>}
    </label>
  )
}

