import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { errorMessage } from './format'
import { compareNames } from './lookupMatch'
import { isBigKind } from './lookupSearch'
import type { Tables } from '../types/database'

export type LookupItem = Tables<'lookup_items'>

export const KINDS = [
  { kind: 'transport_type', label: 'Phân loại VC' },
  { kind: 'vehicle', label: 'Số xe' },
  { kind: 'driver', label: 'Tài xế/ phụ xe' },
  { kind: 'fg_exporter', label: 'NV xuất TP/BTP' },
  { kind: 'material_exporter', label: 'NV xuất VT' },
  { kind: 'construction', label: 'Công trình' },
  { kind: 'delivery_unit', label: 'Đơn vị giao hàng' },
  { kind: 'receiving_unit', label: 'Đơn vị nhận hàng' },
  { kind: 'export_type', label: 'Loại hình xuất' },
  { kind: 'product', label: 'Mặt hàng' },
  { kind: 'unit', label: 'ĐVT' },
  { kind: 'carrier', label: 'Nhà xe' },
] as const

const SMALL_KINDS = KINDS.map((k) => k.kind).filter((k) => !isBigKind(k))

export function useLookups() {
  const [items, setItems] = useState<LookupItem[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    // Chỉ danh mục nhỏ (D-012); danh mục lớn tìm phía server qua LookupCombobox server.
    // PostgREST trả tối đa 1000 dòng/lần → tải theo trang đến khi trang < 1000.
    const all: LookupItem[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('lookup_items').select('*').in('kind', SMALL_KINDS).order('name').order('id').range(from, from + 999)
      if (error) { setError(errorMessage(error)); setLoading(false); return }
      all.push(...data)
      if (data.length < 1000) break
    }
    // Server sắp theo chữ để phân trang ổn định; sắp lại theo số ở client (1, 2, …, 10, 11, 12).
    setItems(all.sort(compareNames))
    setError('')
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- tải dữ liệu lần đầu, setState chạy sau await
  useEffect(() => { reload() }, [reload])
  return { items, error, loading, reload, byKind: (k: string) => items.filter((i) => i.kind === k) }
}
