import { useState } from 'react'
import { avatarUrl } from '../../lib/avatar'

/** Ảnh đại diện tròn; chưa có ảnh (hoặc ảnh lỗi) thì hiện chữ cái đầu của tên. `className` đặt kích thước + cỡ chữ, vd 'h-8 w-8 text-sm'. */
export default function Avatar({ name, path, className = 'h-8 w-8 text-sm' }: { name: string; path?: string | null; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null) // đường dẫn đã lỗi: đổi ảnh khác thì thử lại, không cần effect
  if (path && failed !== path) {
    return <img src={avatarUrl(path)} alt="" loading="lazy" decoding="async" onError={() => setFailed(path)} data-testid="avatar-img"
      className={`shrink-0 rounded-full bg-white object-cover ${className}`} />
  }
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-white ${className}`} data-testid="avatar-initial">
      {(name.trim()[0] ?? '?').toLocaleUpperCase('vi')}
    </span>
  )
}
