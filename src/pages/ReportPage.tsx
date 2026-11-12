import { useState, type KeyboardEvent, type ReactNode } from 'react'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import { formatNumber, todayISO } from '../lib/format'
import { useReport, type MonthRow, type RankRow } from '../lib/useReport'
import MatrixReport, { Kpi, OTHER_COLOR, SLICE_COLORS } from './ReportMatrix'
import type { MatrixMode } from '../lib/useMatrix'

const FIRST_YEAR = 2024 // năm đầu có dữ liệu đã nạp
const ton = (kg: number) => formatNumber(Math.round(kg / 1000))
const pct = (part: number, total: number) => (total > 0 ? `${formatNumber(Math.round((part / total) * 1000) / 10)}%` : '—')
const signed = (d: number) => `${d > 0 ? '+' : ''}${formatNumber(Math.round(d * 10) / 10)}%`
const TOP_SLICES = SLICE_COLORS.length

/** Trục tung "đẹp": bước 1/2/5 × 10^k, 4 vạch → [0, bước, 2 bước, 3 bước, 4 bước] (đơn vị tấn). */
function niceAxis(maxTon: number) {
  if (maxTon <= 0) return { step: 1, ticks: [0, 1, 2, 3, 4] }
  const raw = maxTon / 4
  const p = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 5, 10].find((m) => m * p >= raw) ?? 10) * p
  return { step, ticks: [0, 1, 2, 3, 4].map((i) => i * step) }
}

function Card({ id, title, aside, className = '', children }: { id: string; title: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={`min-w-0 rounded-card border border-stone-200 bg-white p-3 shadow-card print:break-inside-avoid print:shadow-none sm:p-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id={id} className="text-sm font-semibold text-gray-900">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** Thanh ngang một màu: độ dài theo `value / max`. Cột mọc từ trái, bo 4px ở đầu dữ liệu. */
function HBar({ value, max, color, delay }: { value: number; max: number; color: string; delay: number }) {
  return (
    <div aria-hidden="true" className="h-2 rounded-r bg-stone-100">
      <div className="h-2 origin-left animate-grow-x rounded-r transition-[width] duration-500" style={{ width: `${max > 0 ? Math.max((value / max) * 100, 1) : 0}%`, backgroundColor: color, animationDelay: `${delay}ms` }} />
    </div>
  )
}

function MonthChart({ year, months, prev }: { year: number; months: MonthRow[]; prev: MonthRow[] }) {
  const maxKg = Math.max(...months.map((m) => m.weightKg), ...prev.map((m) => m.weightKg), 0)
  const axis = niceAxis(maxKg / 1000)
  const top = axis.ticks[4] * 1000 // đỉnh trục, kg
  const h = (kg: number) => `${top > 0 ? Math.max((kg / top) * 100, kg > 0 ? 0.8 : 0) : 0}%`
  // Chỉ ghi số trên 2 cột: tháng cao nhất và tháng gần nhất có số liệu (ghi mọi cột thì rối); còn lại rê chuột/Tab để xem
  const peakKg = Math.max(...months.map((m) => m.weightKg), 0)
  const lastIdx = months.reduce((l, m, i) => (m.weightKg > 0 ? i : l), -1)
  const labelled = (m: MonthRow, i: number) => m.weightKg > 0 && (m.weightKg === peakKg || i === lastIdx)
  return (
    <div className="mt-3 flex gap-2">
      <ol aria-hidden="true" className="flex h-60 w-9 shrink-0 flex-col-reverse justify-between pb-6 text-right text-[11px] tabular-nums text-muted">
        {axis.ticks.map((t) => <li key={t} className="-mb-1.5 leading-3">{formatNumber(t)}</li>)}
      </ol>
      <div className="-mt-4 min-w-0 flex-1 overflow-x-auto overflow-y-hidden pt-4">
        <div className="relative min-w-[30rem]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[calc(15rem-1.5rem)]">
            {axis.ticks.map((t, i) => <div key={t} className="absolute inset-x-0 border-t border-stone-200" style={{ bottom: `${i * 25}%` }} />)}
          </div>
          <ol aria-label="Khối lượng xuất từng tháng" className="relative flex h-60 items-end gap-1.5" data-testid="report-months">
            {months.map((m, i) => {
              const p = prev[i]
              const side = i < 3 ? 'left-0' : i > 8 ? 'right-0' : 'left-1/2 -translate-x-1/2'
              return (
                <li key={m.month} tabIndex={0} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end rounded text-center outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid={`month-${m.month}`}>
                  <span aria-hidden="true" className="flex min-h-0 flex-1 items-end justify-center gap-0.5 border-b border-stone-300 group-hover:bg-stone-50 group-focus-visible:bg-stone-50">
                    {p && <span className="relative w-[34%] origin-bottom animate-grow-y rounded-t bg-stone-300 transition-[height] duration-500" style={{ height: h(p.weightKg), animationDelay: `${i * 40}ms` }} />}
                    <span className="relative w-[42%] origin-bottom animate-grow-y rounded-t bg-primary transition-[height] duration-500 group-hover:bg-primary-dark" style={{ height: h(m.weightKg), animationDelay: `${i * 40}ms` }}>
                      {labelled(m, i) && <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold tabular-nums text-gray-900">{ton(m.weightKg)}</span>}
                    </span>
                  </span>
                  <span className="h-6 pt-1 text-xs text-muted">T{m.month}</span>
                  <span role="tooltip" className={`pointer-events-none absolute top-1 z-10 hidden w-40 rounded-lg border border-stone-200 bg-white p-2 text-left text-xs shadow-card group-hover:block group-focus-visible:block print:hidden ${side}`}>
                    <span className="block font-semibold text-gray-900">Tháng {m.month}/{year}</span>
                    <span className="mt-1 flex items-center justify-between gap-2"><span className="flex items-center gap-1 text-muted"><span className="h-2 w-2 rounded-sm bg-primary" />{year}</span><span className="tabular-nums text-gray-900">{ton(m.weightKg)} tấn</span></span>
                    <span className="flex items-center justify-between gap-2"><span className="text-muted">Số dòng</span><span className="tabular-nums text-gray-900">{formatNumber(m.lines)}</span></span>
                    {p && <span className="flex items-center justify-between gap-2"><span className="flex items-center gap-1 text-muted"><span className="h-2 w-2 rounded-sm bg-stone-300" />{year - 1}</span><span className="tabular-nums text-gray-900">{ton(p.weightKg)} tấn</span></span>}
                  </span>
                  <span className="sr-only">Tháng {m.month}: {ton(m.weightKg)} tấn, {m.lines} dòng</span>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}

function MonthTable({ year, months, prev }: { year: number; months: MonthRow[]; prev: MonthRow[] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[22rem] text-sm" data-testid="report-months-table">
        <thead>
          <tr className="border-b border-stone-200 text-left text-xs text-muted">
            <th scope="col" className="py-1.5 pr-2 font-medium">Tháng</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Số dòng</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Tấn {year}</th>
            {prev.length > 0 && <th scope="col" className="py-1.5 pl-2 text-right font-medium">Tấn {year - 1}</th>}
          </tr>
        </thead>
        <tbody>
          {months.map((m, i) => (
            <tr key={m.month} className="border-b border-stone-100 last:border-0">
              <th scope="row" className="py-1 pr-2 text-left font-normal text-gray-900">Tháng {m.month}</th>
              <td className="px-2 py-1 text-right tabular-nums">{formatNumber(m.lines)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{ton(m.weightKg)}</td>
              {prev.length > 0 && <td className="py-1 pl-2 text-right tabular-nums text-muted">{ton(prev[i]?.weightKg ?? 0)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const TABS: { id: 'overview' | MatrixMode; label: string }[] = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'product', label: 'Theo nhóm hàng' },
  { id: 'project', label: 'Theo dự án' },
  { id: 'top', label: 'Top 10 dự án' },
]

export default function ReportPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('overview')
  // Thanh tab theo chuẩn WAI-ARIA: mũi tên trái/phải chuyển tab (chỉ tab đang chọn nằm trong thứ tự Tab)
  const onTabKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab)
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (next < 0) return
    e.preventDefault(); setTab(TABS[next].id); document.getElementById(`report-tab-${TABS[next].id}`)?.focus()
  }
  return (
    <div className="space-y-4">
      <PageHeader title="Báo cáo" description="Khối lượng xuất kho theo thời gian, nhóm hàng và dự án">
        <Button variant="secondary" size="sm" onClick={() => window.print()} className="print:hidden" data-testid="report-print">In báo cáo</Button>
      </PageHeader>
      <div role="tablist" aria-label="Loại báo cáo" onKeyDown={onTabKey} className="flex flex-wrap gap-1 border-b border-stone-200 print:hidden">
        {TABS.map((t) => (
          <button key={t.id} id={`report-tab-${t.id}`} type="button" role="tab" aria-selected={tab === t.id} aria-controls="report-panel" tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}
            className={`-mb-px min-h-9 rounded-t-lg border border-b-0 px-3 py-1.5 text-sm font-medium ${tab === t.id ? 'border-stone-200 bg-white text-primary' : 'border-transparent text-muted hover:text-gray-900'}`}>{t.label}</button>
        ))}
      </div>
      <div id="report-panel" role="tabpanel" aria-labelledby={`report-tab-${tab}`}>
        {tab === 'overview' ? <Overview /> : <MatrixReport key={tab} mode={tab} />}
      </div>
    </div>
  )
}

function Overview() {
  const thisYear = Number(todayISO().slice(0, 4))
  const [from, setFrom] = useState(`${thisYear}-01-01`)
  const [to, setTo] = useState(`${thisYear}-12-31`)
  const [asTable, setAsTable] = useState(false)
  const r = useReport(from, to)
  const year = Number(from.slice(0, 4)) || thisYear
  const years = Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, i) => thisYear - i)
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate() // m = 1..12
  const pickYear = (y: number) => { setFrom(`${y}-01-01`); setTo(`${y}-12-31`) }
  const pickMonth = (m: number) => {
    if (m === 0) return pickYear(year)
    setFrom(`${year}-${pad(m)}-01`); setTo(`${year}-${pad(m)}-${lastDay(year, m)}`)
  }
  // ô "Tháng" chỉ hiện tháng khi khoảng ngày đúng bằng cả tháng đó, ngược lại là "Cả năm / tuỳ chọn"
  const monthSel = (() => { const m = Number(from.slice(5, 7)); return from.endsWith('-01') && to === `${year}-${pad(m)}-${lastDay(year, m)}` && from.slice(0, 7) === to.slice(0, 7) ? m : 0 })()
  const rangeText = from === `${year}-01-01` && to === `${year}-12-31` ? `Năm ${year}` : `${from.split('-').reverse().join('/')} – ${to.split('-').reverse().join('/')}`
  const na = r.loading || !!r.error // đang tải hoặc lỗi: không hiện số 0 như thể không có dữ liệu

  const totalKg = r.months.reduce((s, m) => s + m.weightKg, 0)
  const totalLines = r.months.reduce((s, m) => s + m.lines, 0)
  const maxKg = Math.max(...r.months.map((m) => m.weightKg), 0)
  const peak = r.months.find((m) => m.weightKg === maxKg && maxKg > 0)
  const active = r.months.filter((m) => m.weightKg > 0).length
  // Cùng kỳ: useReport đã lấy sẵn đúng khoảng ngày đó của năm trước.
  const prevSameKg = r.prevMonths.reduce((s, m) => s + m.weightKg, 0)
  const delta = prevSameKg > 0 && totalKg > 0 ? ((totalKg - prevSameKg) / prevSameKg) * 100 : null

  const top = r.types.slice(0, TOP_SLICES)
  const restKg = r.types.slice(TOP_SLICES).reduce((s, t) => s + t.weightKg, 0)
  const slices = [...top, ...(restKg > 0 ? [{ name: 'Khác', lines: 0, weightKg: restKg }] : [])]
    .map((t, i) => ({ name: t.name, share: totalKg > 0 ? (t.weightKg / totalKg) * 100 : 0, color: t.name === 'Khác' ? OTHER_COLOR : SLICE_COLORS[i] }))
  const colorOf = (t: RankRow) => slices.find((s) => s.name === t.name)?.color ?? OTHER_COLOR
  const maxTypeKg = Math.max(...r.types.map((t) => t.weightKg), 0)
  const maxProductKg = Math.max(...r.products.map((p) => p.weightKg), 0)

  return (
    <div className="space-y-4 [print-color-adjust:exact]" data-testid="report-page">
      <div className="flex flex-wrap items-end gap-3 print:hidden" data-testid="report-filters">
        <label className="text-sm font-medium text-gray-800">Năm
          <select value={year} onChange={(e) => pickYear(Number(e.target.value))} data-testid="report-year"
            className="mt-1 block rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-800">Tháng
          <select value={monthSel} onChange={(e) => pickMonth(Number(e.target.value))} data-testid="report-month"
            className="mt-1 block rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm">
            <option value={0}>{monthSel === 0 && rangeText !== `Năm ${year}` ? 'Tuỳ chọn' : 'Cả năm'}</option>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-800">Từ ngày
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} data-testid="report-from"
            className="mt-1 block rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm" />
        </label>
        <label className="text-sm font-medium text-gray-800">Đến ngày
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} data-testid="report-to"
            className="mt-1 block rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm" />
        </label>
      </div>

      <p className="hidden text-sm text-muted print:block">Kho An Hạ · {rangeText} · Lập ngày {todayISO().split('-').reverse().join('/')}</p>

      {r.error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-danger-line bg-danger-soft p-2 text-danger" data-testid="report-error">
          <span>{r.error}</span>
          <button type="button" onClick={r.reload} className="min-h-8 rounded border border-danger-line bg-white px-3 text-sm font-medium hover:bg-danger-soft print:hidden">Thử lại</button>
        </div>
      )}

      <section aria-label="Tổng quan" aria-busy={r.loading} className={`grid grid-cols-2 gap-3 lg:grid-cols-4 ${r.loading ? 'animate-pulse' : ''}`}>
        <Kpi testId="kpi-weight" label={`Khối lượng xuất · ${rangeText}`} value={na ? '—' : ton(totalKg)} unit="tấn"
          note={na ? undefined : delta === null ? `${formatNumber(Math.round(totalKg))} kg` : `${signed(delta)} so với cùng kỳ ${year - 1}`} tone={delta === null ? undefined : delta < 0 ? 'down' : 'up'} />
        <Kpi testId="kpi-plans" label="Số phiếu thống kê" value={na || r.plans === null ? '—' : formatNumber(r.plans)} note={na || !r.plans || !active ? undefined : `khoảng ${formatNumber(Math.round(r.plans / active))} phiếu/tháng`} />
        <Kpi testId="kpi-lines" label="Số dòng bảng kiểm" value={na ? '—' : formatNumber(totalLines)} note={na || !r.plans ? undefined : `${formatNumber(Math.round((totalLines / r.plans) * 10) / 10)} dòng/phiếu`} />
        <Kpi testId="kpi-peak" label="Tháng xuất nhiều nhất" value={na || !peak ? '—' : `Tháng ${peak.month}`} note={na || !peak ? undefined : `${ton(peak.weightKg)} tấn · trung bình ${ton(totalKg / Math.max(active, 1))} tấn/tháng`} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card id="rp-month" title="Khối lượng xuất theo tháng (tấn)" className="lg:col-span-2" aside={(
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-primary" />{year}</span>
            {r.prevMonths.length > 0 && <span className="flex items-center gap-1"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-stone-300" />{year - 1}</span>}
            <button type="button" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable} data-testid="report-view-toggle"
              className="min-h-7 rounded border border-stone-300 px-2 py-1 text-gray-800 hover:bg-stone-50 print:hidden">{asTable ? 'Xem biểu đồ' : 'Xem dạng bảng'}</button>
          </div>
        )}>
          {asTable ? <MonthTable year={year} months={r.months} prev={r.prevMonths} /> : <MonthChart year={year} months={r.months} prev={r.prevMonths} />}
        </Card>

        <Card id="rp-product" title={`${r.products.length || ''} mặt hàng xuất nhiều nhất (tấn)`.trim()}>
          <ol className="mt-3 space-y-2.5" data-testid="report-products">
            {r.products.map((p, i) => (
              <li key={p.name} data-testid="product-row" title={`${p.name}: ${ton(p.weightKg)} tấn · ${formatNumber(p.lines)} dòng`}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-gray-900">{p.name}</span>
                  <span className="shrink-0 tabular-nums text-gray-900">{ton(p.weightKg)} <span className="text-xs text-muted">· {pct(p.weightKg, totalKg)}</span></span>
                </div>
                <div className="mt-1"><HBar value={p.weightKg} max={maxProductKg} color="#C8102E" delay={i * 60} /></div>
              </li>
            ))}
            {!na && r.products.length === 0 && <li className="text-sm text-muted">Chưa có số liệu mặt hàng.</li>}
          </ol>
        </Card>
      </div>

      <Card id="rp-type" title="Cơ cấu theo loại hình xuất">
        {slices.length > 0 && (
          <div className="mt-3 flex h-4 gap-0.5 overflow-hidden rounded" role="img" aria-label="Tỷ trọng khối lượng theo loại hình xuất" data-testid="report-share-bar">
            {slices.map((s) => <div key={s.name} className="min-w-[2px] transition-[flex-grow] duration-500" style={{ flexGrow: s.share, flexBasis: 0, backgroundColor: s.color }} title={`${s.name}: ${formatNumber(Math.round(s.share * 10) / 10)}%`} />)}
          </div>
        )}
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm print:min-w-0" data-testid="report-types">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs text-muted">
                <th scope="col" className="py-1.5 pr-2 font-medium">Loại hình xuất</th>
                <th scope="col" className="w-1/4 px-2 py-1.5 font-medium"><span className="sr-only">Biểu đồ</span></th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">Số dòng</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">Tấn</th>
                <th scope="col" className="py-1.5 pl-2 text-right font-medium">Tỷ trọng</th>
              </tr>
            </thead>
            <tbody>
              {r.types.map((t, i) => (
                <tr key={t.name} className="border-b border-stone-100 last:border-0 hover:bg-stone-50" data-testid="type-row">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal text-gray-900">
                    <span className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: colorOf(t) }} />{t.name}</span>
                  </th>
                  <td className="px-2 py-1.5"><HBar value={t.weightKg} max={maxTypeKg} color={colorOf(t)} delay={i * 50} /></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(t.lines)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{ton(t.weightKg)}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-muted">{pct(t.weightKg, totalKg)}</td>
                </tr>
              ))}
              {!na && r.types.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-muted">{rangeText} chưa có dữ liệu.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted">Số liệu lấy từ Bảng kiểm theo ngày xuất; khối lượng làm tròn đến tấn. Cùng kỳ là đúng khoảng ngày đó của năm trước. Khoảng ngày quá cuối năm của "Từ ngày" sẽ bị cắt ở 31/12.</p>
    </div>
  )
}
