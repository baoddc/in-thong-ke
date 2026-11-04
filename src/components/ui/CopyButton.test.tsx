// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CopyButton from './CopyButton'
import { ToastProvider } from './Toast'

afterEach(cleanup)

describe('CopyButton', () => {
  it('chép giá trị vào clipboard và báo đã chép', async () => {
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<ToastProvider><CopyButton value="TK2026/11-071" label="Chép số phiếu TK2026/11-071" testId="copy" /></ToastProvider>)
    await user.click(screen.getByTestId('copy'))
    expect(write).toHaveBeenCalledWith('TK2026/11-071')
    expect(await screen.findByText('Đã chép TK2026/11-071')).toBeTruthy()
  })
})
