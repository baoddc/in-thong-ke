import { useState } from 'react'
import { avatarUrl } from '../../lib/avatar'

/** Ảnh đại diện tròn; chưa có ảnh (hoặc ảnh lỗi) thì hiện chữ cái đầu của tên. `className` đặt kích thước + cỡ chữ, vd 'h-8 w-8 text-sm'. */
export default function Avatar({ name, path, className = 'h-8 w-8 text-sm' }: { name: string; path?: string | null; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null) // đường dẫn đã lỗi: đổi ảnh khác thì thử lại, không cần effect
  if (path && failed !== path) {
    return <img src={avatarUrl(path)} alt="" loading="lazy" decoding="async" onError={() => setFailed(path)} data-testid="avatar-img"
      className={`shrink-0 rounded-full bg-white object-cover ${className}`} />
  }
  // Chữ cái đầu vẽ bằng CSS (data-initials) như Badge: không lẫn vào nội dung văn bản của phần tử cha
  return (
    <span aria-hidden="true" data-initials={(name.trim()[0] ?? '?').toLocaleUpperCase('vi')} data-testid="avatar-initial"
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-white before:content-[attr(data-initials)] ${className}`} />
  )
}
