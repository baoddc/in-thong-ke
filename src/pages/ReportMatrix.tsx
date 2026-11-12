import { useEffect, useMemo, useState } from 'react'
import LookupCombobox from '../components/LookupCombobox'
import { formatNumber, todayISO } from '../lib/format'
import { useMatrix, type MatrixMode, type TypeCol } from '../lib/useMatrix'

// Màu theo loại hình, thứ tự cố định (đã chạy validate_palette: 5 màu qua cả 4 kiểm tra; #1BAF7A thấp hơn 3:1 nên luôn có nhãn + bảng đi kèm). Phần "Khác" là xám trung tính.
export const SLICE_COLORS = ['#C8102E', '#2A78D6', '#B45309', '#1BAF7A', '#6250D6']
export const OTHER_COLOR = '#A8A29E'

const kg = (v: number) => formatNumber(Math.round(v))
const inputCls = 'mt-1 block rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm'

const TITLES: Record<MatrixMode, { h: string; row: string; note: string }> = {
  product: { h: 'Nhóm mặt hàng × loại hình xuất (kg)', row: 'Nhóm mặt hàng', note: 'Mặt hàng gõ tự do (vd "BĂNG KEO") hoặc chưa chọn không thuộc nhóm nào nên gom vào mục "Mặt hàng khác".' },
  project: { h: 'Dự án: nhóm mặt hàng × loại hình xuất (kg)', row: 'Nhóm mặt hàng', note: 'Dự án là tên công trình. Dòng chưa chọn công trình không thuộc dự án nào.' },
  top: { h: '10 dự án xuất nhiều nhất (kg)', row: 'Dự án', note: 'Dự án là tên công trình. Dòng chưa chọn công trình không được tính.' },
}

/** Tô nhạt cả hàng và cả cột của ô đang rê chuột (hình dấu +), ô giao nhau đậm hơn. Dùng backgroundImage nên nằm trên màu bản đồ nhiệt của ô, không che mất nó. */
const shade = (row: boolean, col: boolean, center = false) => {
  if (!row && !col) return undefined
  const a = center ? 0.12 : 0.05
  return { backgroundImage: `linear-gradient(rgba(15, 23, 42, ${a}), rgba(15, 23, 42, ${a}))` }
}

/** Ô màu đậm dần theo khối lượng (căn bậc hai để ô nhỏ vẫn thấy được); chữ giữ màu thường nên đọc được cả khi in. */
const heat = (v: number, max: number) => (v > 0 && max > 0 ? { backgroundColor: `rgba(200, 16, 46, ${(0.05 + 0.3 * Math.sqrt(v / max)).toFixed(3)})` } : undefined)

export function Kpi({ label, value, unit, note, tone, testId }: { label: string; value: string; unit?: string; note?: string; tone?: 'up' | 'down'; testId: string }) {
  return (
    <div className="min-w-0 rounded-card border border-stone-200 bg-white p-3 shadow-card print:shadow-none" data-testid={testId}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 break-words font-bold tabular-nums text-gray-900 ${value.length > 12 ? 'text-base leading-snug' : 'text-2xl'}`}>{value}{unit && <span className="ml-1 text-sm font-medium text-muted">{unit}</span>}</p>
      {/* màu trạng thái luôn đi kèm ký hiệu ▲/▼ và chữ, không chỉ dựa vào màu */}
      {note && <p className={`mt-0.5 text-xs ${tone === 'up' ? 'font-medium text-success' : tone === 'down' ? 'font-medium text-danger' : 'text-muted'}`}>{tone === 'up' ? '▲ ' : tone === 'down' ? '▼ ' : ''}{note}</p>}
    </div>
  )
}

function TopBars({ rows, types, cells }: { rows: string[]; types: TypeCol[]; cells: Map<string, Map<number | null, number>> }) {
  const sum = (m?: Map<number | null, number>) => [...(m?.values() ?? [])].reduce((s, v) => s + v, 0)
  const typeKg = (t: TypeCol) => rows.reduce((s, r) => s + (cells.get(r)?.get(t.id) ?? 0), 0)
  const ranked = [...types].sort((a, b) => typeKg(b) - typeKg(a)).filter((t) => typeKg(t) > 0)
  const shown = ranked.slice(0, SLICE_COLORS.length)
  const colorOf = (t: TypeCol) => { const i = shown.findIndex((s) => s.id === t.id); return i >= 0 ? SLICE_COLORS[i] : OTHER_COLOR }
  const max = Math.max(...rows.map((r) => sum(cells.get(r))), 0)
  return (
    <div className="mt-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {shown.map((t) => <li key={t.name} className="flex items-center gap-1"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colorOf(t) }} />{t.name}</li>)}
        {ranked.length > shown.length && <li className="flex items-center gap-1"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: OTHER_COLOR }} />Khác</li>}
      </ul>
      <ol className="mt-2 space-y-1.5" data-testid="top-bars">
        {rows.map((r, i) => (
          <li key={r} className="flex items-center gap-2 text-sm" data-testid="top-bar-row">
            <span className="w-40 shrink-0 truncate text-gray-900 sm:w-56" title={r}>{r}</span>
            <div className="flex h-4 min-w-0 flex-1 gap-0.5" aria-hidden="true" style={{ maxWidth: `${max > 0 ? (sum(cells.get(r)) / max) * 100 : 0}%` }}>
              {ranked.map((t) => { const v = cells.get(r)?.get(t.id) ?? 0; return v > 0 ? <div key={t.name} className="min-w-[2px] origin-left animate-grow-x first:rounded-l last:rounded-r" style={{ flexGrow: v, flexBasis: 0, backgroundColor: colorOf(t), animationDelay: `${i * 50}ms` }} title={`${t.name}: ${kg(v)} kg`} /> : null })}
            </div>
            <span className="w-24 shrink-0 text-right tabular-nums text-gray-900">{kg(sum(cells.get(r)))}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function MatrixReport({ mode }: { mode: MatrixMode }) {
  const thisYear = todayISO().slice(0, 4)
  const [from, setFrom] = useState(`${thisYear}-01-01`)
  const [to, setTo] = useState(todayISO())
  const [project, setProject] = useState('')
  const [hover, setHover] = useState<{ row: string | null; col: string | null }>({ row: null, col: null }) // ô đang rê chuột: tô nhạt cả hàng và cột của ô đó
  const m = useMatrix(from, to, mode, project)
  // Mở tab "Theo dự án": chọn sẵn dự án nhiều nhất trong kỳ
  // eslint-disable-next-line react-hooks/set-state-in-effect -- đặt lựa chọn mặc định khi danh sách dự án vừa tải xong
  useEffect(() => { if (mode === 'project' && !project && m.projects.length > 0) setProject(m.projects[0].project) }, [mode, project, m.projects])

  const projectItems = useMemo(() => m.projects.map((p, i) => ({ id: i + 1, name: p.project, hint: `${formatNumber(Math.round(p.weightKg / 1000))} tấn` })), [m.projects])
  const selectedId = projectItems.find((p) => p.name === project)?.id ?? 0
  const t = TITLES[mode]
  const colTotal = (id: number | null) => m.rowOrder.reduce((s, r) => s + (m.cells.get(r)?.get(id) ?? 0), 0)
  const rowTotal = (r: string) => [...(m.cells.get(r)?.values() ?? [])].reduce((s, v) => s + v, 0)
  const grand = m.rowOrder.reduce((s, r) => s + rowTotal(r), 0)
  const max = Math.max(...m.rowOrder.flatMap((r) => [...(m.cells.get(r)?.values() ?? [])]), 0)
  const empty = !m.loading && !m.error && m.rowOrder.length === 0
  // Cột loại hình không có kg nào trong kỳ thì ẩn (bảng gọn, đỡ cuộn ngang)
  const cols = m.types.filter((c) => colTotal(c.id) > 0)
  const ranking = [...m.rowOrder].sort((a, b) => rowTotal(b) - rowTotal(a)) // biểu đồ xếp hạng theo khối lượng, khác thứ tự số của bảng
  const topRow = ranking[0]
  const topType = [...cols].sort((a, b) => colTotal(b.id) - colTotal(a.id))[0]
  const pctOf = (v: number) => (grand > 0 ? `${formatNumber(Math.round((v / grand) * 1000) / 10)}%` : '—')
  const projectsKg = m.projects.reduce((s, p) => s + p.weightKg, 0) // tổng các dự án có công trình trong kỳ (không gồm dòng chưa chọn công trình)
  const CHART_ROWS = 10
  const hasData = !m.loading && !m.error && m.rowOrder.length > 0

  return (
    <div className="space-y-4 [print-color-adjust:exact]" data-testid={`matrix-view-${mode}`}>
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-sm font-medium text-gray-800">Từ ngày
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} data-testid="matrix-from" className={inputCls} />
        </label>
        <label className="text-sm font-medium text-gray-800">Đến ngày
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} data-testid="matrix-to" className={inputCls} />
        </label>
        {mode === 'project' && (
          <div className="min-w-0 flex-1 basis-80 sm:max-w-[32rem]">
            {/* Dùng lại ô tìm của Bảng kiểm (tìm không dấu, không phân biệt hoa thường). id = vị trí trong danh sách; đang gõ dở thì dự án đang xem giữ nguyên */}
            <LookupCombobox key={project ? 'set' : 'unset'} label="Dự án (gõ để tìm)" kind="report_project" items={projectItems} allowAdd={false} testId="matrix-project" placeholder="Gõ tên công trình..."
              selectedIds={selectedId ? [selectedId] : []} onChange={(ids) => { if (ids.length) setProject(projectItems[ids[0] - 1].name) }} />
          </div>
        )}
      </div>
      <p className="hidden text-sm text-muted print:block">Kho An Hạ · {from.split('-').reverse().join('/')} – {to.split('-').reverse().join('/')}{mode === 'project' && project ? ` · Dự án ${project}` : ''}</p>

      {m.error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-danger-line bg-danger-soft p-2 text-danger" data-testid="matrix-error">
          <span>{m.error}</span>
          <button type="button" onClick={m.reload} className="min-h-8 rounded border border-danger-line bg-white px-3 text-sm font-medium hover:bg-danger-soft print:hidden">Thử lại</button>
        </div>
      )}

      {mode !== 'top' && hasData && (
        <>
          <section aria-label="Tóm tắt" className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="matrix-kpis">
            <Kpi testId="mx-kpi-total" label="Tổng khối lượng" value={formatNumber(Math.round(grand / 1000))} unit="tấn" note={`${kg(grand)} kg`} />
            <Kpi testId="mx-kpi-row" label="Nhóm hàng lớn nhất" value={topRow} note={`${formatNumber(Math.round(rowTotal(topRow) / 1000))} tấn · ${pctOf(rowTotal(topRow))}`} />
            <Kpi testId="mx-kpi-type" label="Loại hình xuất lớn nhất" value={topType?.name ?? '—'} note={topType ? `${formatNumber(Math.round(colTotal(topType.id) / 1000))} tấn · ${pctOf(colTotal(topType.id))}` : undefined} />
            {mode === 'product'
              ? <Kpi testId="mx-kpi-extra" label="Nhóm hàng có xuất" value={`${m.rowOrder.filter((r) => /^\d+ - /.test(r)).length}/24`} note="nhóm danh mục (không tính mục khác)" />
              : <Kpi testId="mx-kpi-extra" label="Tỷ trọng trong các dự án" value={projectsKg > 0 ? `${formatNumber(Math.round((grand / projectsKg) * 1000) / 10)}%` : '—'} note="so với tổng các dự án trong kỳ" />}
          </section>
          <section aria-labelledby={`mxc-${mode}`} className="min-w-0 rounded-card border border-stone-200 bg-white p-3 shadow-card print:break-inside-avoid print:shadow-none sm:p-4">
            <h2 id={`mxc-${mode}`} className="text-sm font-semibold text-gray-900">Xếp hạng nhóm hàng theo khối lượng (kg)</h2>
            <TopBars rows={ranking.slice(0, CHART_ROWS)} types={cols} cells={m.cells} />
            {ranking.length > CHART_ROWS && <p className="mt-2 text-xs text-muted">Hiện {CHART_ROWS} nhóm đầu; {ranking.length - CHART_ROWS} nhóm còn lại xem trong bảng bên dưới.</p>}
          </section>
        </>
      )}

      <section className="min-w-0 rounded-card border border-stone-200 bg-white p-3 shadow-card print:shadow-none sm:p-4" aria-labelledby={`mx-${mode}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={`mx-${mode}`} className="text-sm font-semibold text-gray-900">{t.h}</h2>
          {!m.loading && !m.error && <p className="text-sm tabular-nums text-gray-900" data-testid="matrix-grand">Tổng cộng: {kg(grand)} kg</p>}
        </div>
        {max > 0 && (
          // chú giải thang màu: ô càng đậm càng nhiều kg (số vẫn in trong từng ô nên không phụ thuộc màu)
          <p className="mt-2 flex items-center gap-2 text-xs text-muted" data-testid="matrix-legend">
            Ít<span aria-hidden="true" className="h-2.5 w-24 rounded" style={{ background: 'linear-gradient(to right, rgba(200,16,46,0.05), rgba(200,16,46,0.35))' }} />Nhiều (ô đậm nhất {kg(max)} kg)
          </p>
        )}
        {mode === 'top' && m.rowOrder.length > 0 && <TopBars rows={m.rowOrder} types={cols} cells={m.cells} />}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm print:min-w-0 print:text-[10px]" data-testid="matrix-table" aria-busy={m.loading}>
            <thead>
              <tr className="border-b border-stone-300 text-xs text-muted">
                <th scope="col" className="sticky left-0 z-10 min-w-[9rem] bg-white py-1.5 pr-2 text-left font-medium">{t.row}</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">Tổng cộng (kg)</th>
                {cols.map((c) => <th key={c.name} scope="col" className={`min-w-[5.5rem] px-2 py-1.5 text-right font-medium ${hover.col === c.name ? 'text-gray-900' : ''}`} style={shade(false, hover.col === c.name)}>{c.name}</th>)}
              </tr>
            </thead>
            <tbody onMouseLeave={() => setHover({ row: null, col: null })}>
              {m.rowOrder.map((r) => (
                <tr key={r} className="border-b border-stone-100" data-testid="matrix-row">
                  <th scope="row" className="sticky left-0 z-10 bg-white py-1 pr-2 text-left font-normal text-gray-900" style={shade(hover.row === r, false)} onMouseEnter={() => setHover({ row: r, col: null })}>{r}</th>
                  <td className="px-2 py-1 text-right font-semibold tabular-nums text-gray-900" style={shade(hover.row === r, false)} onMouseEnter={() => setHover({ row: r, col: null })}>{kg(rowTotal(r))}</td>
                  {cols.map((c) => {
                    const v = m.cells.get(r)?.get(c.id) ?? 0
                    return <td key={c.name} className="px-2 py-1 text-right tabular-nums text-gray-900" style={{ ...heat(v, max), ...shade(hover.row === r, hover.col === c.name, hover.row === r && hover.col === c.name) }} onMouseEnter={() => setHover({ row: r, col: c.name })}>{v > 0 ? kg(v) : ''}</td>
                  })}
                </tr>
              ))}
              {m.loading && <tr><td colSpan={cols.length + 2} className="animate-pulse py-3 text-center text-muted">Đang tải…</td></tr>}
              {empty && <tr><td colSpan={cols.length + 2} className="py-3 text-center text-muted">Không có dữ liệu trong khoảng ngày này.</td></tr>}
            </tbody>
            {m.rowOrder.length > 0 && (
              <tfoot>
                <tr className="border-t border-stone-300 font-semibold">
                  <th scope="row" className="sticky left-0 z-10 bg-white py-1.5 pr-2 text-left">Tổng cộng</th>
                  <td className="px-2 py-1.5 text-right tabular-nums">{kg(grand)}</td>
                  {cols.map((c) => <td key={c.name} className="px-2 py-1.5 text-right tabular-nums" style={shade(false, hover.col === c.name)}>{kg(colTotal(c.id))}</td>)}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
      <p className="text-xs text-muted">{t.note} Đơn vị kg, ô trống là không xuất.</p>
    </div>
  )
}
