import { describe, expect, it } from 'vitest'
import { defaultExporter } from './usePlanForm'
import { exporterOptions } from './useLookups'

describe('exporterOptions', () => {
  const lists: Record<string, { id: number }[]> = { fg_exporter: [{ id: 1 }], material_exporter: [{ id: 3 }, { id: 4 }], driver: [{ id: 9 }] }
  const kind = (k: string) => lists[k] ?? []
  it('chỉ danh mục của ô, thêm người phiếu cũ đang có ở danh mục kia', () => {
    expect(exporterOptions('fg_exporter', kind, [null]).map((i) => i.id)).toEqual([1])
    expect(exporterOptions('fg_exporter', kind, [3]).map((i) => i.id)).toEqual([1, 3])
    expect(exporterOptions('driver', kind, [3]).map((i) => i.id)).toEqual([9])
  })
})

const items: Record<string, { id: number; name: string }[]> = {
  fg_exporter: [{ id: 1, name: 'Lê Duy Khánh' }],
  material_exporter: [{ id: 2, name: 'Lê Thái Bão' }],
}
const byKind = (k: string) => items[k] ?? []

describe('defaultExporter', () => {
  it('ưu tiên NV xuất TP/BTP, không phân biệt hoa/thường và khoảng trắng', () => {
    expect(defaultExporter('  lê  duy KHÁNH ', byKind)).toEqual({ fgExporterId: 1 })
  })
  it('không có trong TP/BTP thì vào NV xuất VT', () => {
    expect(defaultExporter('Lê Thái Bão', byKind)).toEqual({ materialIds: [2] })
  })
  it('không khớp hoặc không có tên thì để trống', () => {
    expect(defaultExporter('Người Lạ', byKind)).toEqual({})
    expect(defaultExporter(null, byKind)).toEqual({})
  })
})
