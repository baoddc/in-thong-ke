import type { ReactNode } from 'react'

/** Thanh trên của nội dung: tiêu đề + mô tả 1 dòng, nút chính (children) bên phải. */
export default function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-stone-200 pb-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">{title}</h1>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}
