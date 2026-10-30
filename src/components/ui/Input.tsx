import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

export const inputClass =
  'mt-1 block w-full min-h-10 rounded-lg border border-line bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500 transition duration-150 hover:border-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary disabled:bg-gray-100 aria-[invalid=true]:border-danger'

/** Nhãn của ô nhập trong form. */
export const labelClass = 'block text-sm font-medium text-gray-800'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = '', ...rest }, ref) {
  return <input ref={ref} className={`${inputClass} ${className}`} {...rest} />
})

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${inputClass} ${className}`} {...rest} />
}

/** Nhãn + ô nhập + gợi ý/lỗi cạnh ô; nhãn gắn với ô nhập qua <label>. */
export function Field({ label, hint, error, className = '', children }: { label: string; hint?: string; error?: string; className?: string; children: ReactNode }) {
  return (
    <label className={`${labelClass} ${className}`}>
      {label}
      {children}
      {hint && !error && <span className="mt-0.5 block text-sm font-normal text-muted">{hint}</span>}
      {error && <span role="alert" className="mt-0.5 block text-sm font-normal text-danger">{error}</span>}
    </label>
  )
}
