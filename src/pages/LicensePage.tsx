import PageHeader from '../components/ui/PageHeader'
import license from '../../LICENSE?raw' // đọc thẳng file LICENSE của repo: một nguồn duy nhất, không chép tay

/** Giấy phép MIT hiện trong app (sau đăng nhập), dạng mã nguồn có số dòng. */
export default function LicensePage() {
  const lines = license.replace(/\r\n/g, '\n').trimEnd().split('\n')
  return (
    <div className="space-y-4">
      <PageHeader title="Giấy phép MIT" description="Giấy phép phần mềm In thống kê — Kho An Hạ" />
      <pre className="overflow-x-auto rounded-card border border-stone-200 bg-white py-4 font-mono text-[13px] leading-6 text-gray-800 shadow-card" data-testid="license-text">
        {lines.map((l, i) => (
          <div key={i} className="flex">
            <span className="w-14 shrink-0 select-none pr-6 text-right text-gray-400" aria-hidden="true">{i + 1}</span>
            <span className="whitespace-pre-wrap pr-4">{l || ' '}</span>
          </div>
        ))}
      </pre>
    </div>
  )
}
