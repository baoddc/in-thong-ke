import Icon from './Icon'
import { useToast } from './Toast'

/** Nút chép nhanh một giá trị (vd số phiếu TK) vào clipboard; ô chứa nó là nút mở phiếu nên không bôi đen được. */
export default function CopyButton({ value, label, testId }: { value: string; label: string; testId?: string }) {
  const toast = useToast()
  const copy = () => navigator.clipboard.writeText(value).then(
    () => toast.success(`Đã chép ${value}`),
    () => toast.error('Không chép được — trình duyệt chặn quyền clipboard'),
  )
  return (
    <button type="button" onClick={() => void copy()} aria-label={label} title={label} data-testid={testId}
      className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded align-middle text-gray-400 transition-colors duration-150 hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <Icon name="copy" size={14} />
    </button>
  )
}
