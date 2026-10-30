import type { ReactNode } from 'react'

/** Trạng thái rỗng: hình minh họa đơn giản + câu hướng dẫn + nút (children). */
export default function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-4">
      <svg viewBox="0 0 120 96" width="120" height="96" aria-hidden="true" fill="none">
        <ellipse cx="60" cy="86" rx="38" ry="6" className="fill-stone-200" />
        <rect x="26" y="14" width="68" height="62" rx="8" className="fill-white stroke-stone-300" strokeWidth="2" />
        <rect x="36" y="26" width="30" height="6" rx="3" className="fill-primary" opacity="0.85" />
        <rect x="36" y="40" width="48" height="5" rx="2.5" className="fill-stone-200" />
        <rect x="36" y="52" width="40" height="5" rx="2.5" className="fill-stone-200" />
        <rect x="36" y="64" width="24" height="5" rx="2.5" className="fill-stone-200" />
        <circle cx="90" cy="68" r="14" className="fill-primary-soft stroke-primary" strokeWidth="2" />
        <path d="M84 68h12M90 62v12" className="stroke-primary" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <p className="text-base font-semibold text-gray-900">{title}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {children}
    </div>
  )
}
