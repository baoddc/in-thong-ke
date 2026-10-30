import { Fragment } from 'react'
import { badgeTone, initials } from '../../lib/badgeColor'

/** Nhãn màu; màu ổn định theo nội dung (cùng tên → cùng màu). Không có nội dung thì không hiện gì. */
export function Badge({ name }: { name: string | null | undefined }) {
  if (!name) return null
  return <span className={`inline-block max-w-[16rem] truncate rounded-full px-2.5 py-0.5 align-middle text-xs font-medium ring-1 ring-inset ${badgeTone(name)}`} title={name}>{name}</span>
}

/** Người: ô tròn chữ cái đầu + tên. Chữ cái đầu vẽ bằng CSS (data-initials) nên không lẫn vào nội dung văn bản. */
export function PersonChip({ name }: { name: string | null | undefined }) {
  if (!name) return null
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" data-initials={initials(name)}
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1 ring-inset before:content-[attr(data-initials)] ${badgeTone(name)}`} />
      {name}
    </span>
  )
}

/** Nhiều người, ngăn cách bằng ", " (chỉ hiện với trình đọc/văn bản để giữ nội dung ô như cũ). */
export function PersonChips({ names }: { names: string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-1">
      {names.map((n, i) => (
        <Fragment key={`${n}-${i}`}>
          {i > 0 && <span className="sr-only">, </span>}
          <PersonChip name={n} />
        </Fragment>
      ))}
    </span>
  )
}
