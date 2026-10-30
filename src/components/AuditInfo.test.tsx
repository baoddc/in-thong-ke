// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AuditCell, AuditNote } from './AuditInfo'

afterEach(cleanup)

const bao = { created_by: 'u1', created_by_name: 'Lê Thái Bão', created_by_username: 'bao.lt', created_at: '2026-10-30T07:05:00Z' }
const quoc = { updated_by: 'u2', updated_by_name: 'Lê Thái Quốc', updated_by_username: 'quoc.lt', updated_at: '2026-10-30T08:00:00Z' }

describe('AuditCell (D-017: tên có sẵn trong dòng)', () => {
  it('chỉ hiện dòng Sửa khi có updated_by; username + dd/MM HH:mm giờ VN', () => {
    render(<AuditCell row={bao} />)
    expect(screen.getByTestId('audit-cell').textContent).toBe('Tạo: bao.lt · 30/10 14:05')
    cleanup()
    render(<AuditCell row={{ ...bao, ...quoc }} />)
    expect(screen.getByTestId('audit-cell').textContent).toBe('Tạo: bao.lt · 30/10 14:05Sửa: quoc.lt · 30/10 15:00')
    expect(screen.getByText('bao.lt').parentElement?.title).toContain('Lê Thái Bão')
  })
  it('không có người tạo/sửa → —', () => {
    const { container } = render(<AuditCell row={{}} />)
    expect(container.textContent).toBe('—')
  })
})

describe('AuditNote', () => {
  it('ghép họ tên + username của người tạo và người sửa', () => {
    render(<AuditNote row={{ ...bao, ...quoc }} />)
    const t = screen.getByTestId('audit-note').textContent
    expect(t).toContain('Tạo bởi Lê Thái Bão (bao.lt)')
    expect(t).toContain('sửa lần cuối bởi Lê Thái Quốc (quoc.lt)')
  })
})
