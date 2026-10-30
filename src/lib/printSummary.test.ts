import { describe, expect, it } from 'vitest'
import { carrierList, countSlips, formatDateTime, formatFixed2, shipperList, sumField } from './printSummary'
import type { InspectionRow } from '../types/inspection'

const row = (o: Partial<InspectionRow>) => o as InspectionRow

describe('printSummary', () => {
  const rows = [
    row({ quantity: 30, total_weight_kg: 12500.94, warehouse_slip_no: '4900173522', carrier_name: 'Xe DDC' }),
    row({ quantity: 27, total_weight_kg: 10019.16, warehouse_slip_no: '4900173521', carrier_name: 'Xe DDC' }),
    row({ quantity: 36, total_weight_kg: null, warehouse_slip_no: ' ', carrier_name: null }),
    row({ quantity: null, total_weight_kg: null, warehouse_slip_no: '4900173522', carrier_name: 'Xe thuê' }),
  ]

  it('tổng số lượng và khối lượng, bỏ ô trống', () => {
    expect(formatFixed2(sumField(rows, 'quantity'))).toBe('93,00')
    expect(formatFixed2(sumField(rows, 'total_weight_kg'))).toBe('22.520,10')
    expect(sumField([], 'quantity')).toBe(0)
  })

  it('đếm số phiếu xuất kho khác nhau, bỏ trống', () => {
    expect(countSlips(rows)).toBe(2)
  })

  it('nhà xe không trùng, bỏ trống', () => {
    expect(carrierList(rows)).toBe('Xe DDC, Xe thuê')
    expect(carrierList([])).toBe('')
  })

  it('NV xuất hàng khác nhau của các dòng, bỏ trống/trùng', () => {
    const r = [row({ shipper_name: 'An' }), row({ shipper_name: 'Bình' }), row({ shipper_name: 'An' }), row({ shipper_name: null })]
    expect(shipperList(r)).toBe('An, Bình')
    expect(shipperList([])).toBe('')
  })

  it('định dạng số 2 chữ số thập phân và ngày giờ giờ Việt Nam', () => {
    expect(formatFixed2(30)).toBe('30,00')
    expect(formatFixed2(null)).toBe('')
    expect(formatDateTime('2026-10-28T14:16:09+00:00')).toBe('28/10/2026 21:16:09')
    expect(formatDateTime(null)).toBe('')
  })
})
