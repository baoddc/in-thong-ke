import type { ButtonHTMLAttributes } from 'react'
import Icon, { type IconName } from './Icon'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'md' | 'sm'

const BASE = 'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100'
const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-white shadow-sm hover:bg-primary-dark hover:shadow',
  secondary: 'border border-line bg-white text-gray-900 hover:border-gray-400 hover:bg-stone-50',
  danger: 'bg-danger text-white shadow-sm hover:bg-danger-dark focus-visible:ring-danger',
  ghost: 'text-primary hover:bg-primary-soft',
}
const SIZE: Record<Size, string> = {
  md: 'min-h-10 px-4 py-2',
  sm: 'min-h-10 px-3 py-1 text-sm sm:min-h-8', // vẫn ≥ 40px trên điện thoại
}

/** Lớp CSS của nút — dùng cho cả `<Link>` trông như nút. */
export const buttonClass = (variant: Variant = 'secondary', size: Size = 'md') => `${BASE} ${VARIANT[variant]} ${SIZE[size]}`

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: IconName }

export default function Button({ variant, size, icon, className = '', type = 'button', children, ...rest }: Props) {
  return (
    <button type={type} className={`${buttonClass(variant, size)} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  )
}

type Tone = 'default' | 'danger'
const TONE: Record<Tone, string> = {
  default: 'text-gray-600 hover:bg-primary-soft hover:text-primary',
  danger: 'text-danger hover:bg-danger-soft',
}

/** Lớp CSS của nút biểu tượng (≥ 40px trên điện thoại, 32px trên máy tính) — dùng cho cả `<Link>`. */
export const iconButtonClass = (tone: Tone = 'default') =>
  `inline-flex h-10 w-10 items-center justify-center rounded-lg transition duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-8 sm:w-8 ${TONE[tone]}`

/** Nút chỉ có biểu tượng: bắt buộc `label` (đọc cho trình đọc màn hình và hiện gợi ý khi rê chuột). */
export function IconButton({ icon, label, tone, className = '', type = 'button', ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { icon: IconName; label: string; tone?: Tone }) {
  return (
    <button type={type} aria-label={label} title={label} className={`${iconButtonClass(tone)} ${className}`} {...rest}>
      <Icon name={icon} size={18} />
    </button>
  )
}
