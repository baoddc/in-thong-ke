import type { ReactNode } from 'react'

/** Thanh trên của nội dung: tiêu đề (+ mô tả cùng hàng từ md trở lên), nút (children) bên phải. */
export default function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
        <h1 className="text-lg font-bold tracking-tight text-gray-900 sm:text-xl">{title}</h1>
        {description && <p className="hidden truncate text-sm text-muted md:block">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
    </div>
  )
}
