import type { Config } from 'tailwindcss'
import colors from 'tailwindcss/colors'

// Bộ token dùng chung. Thương hiệu Đại Dũng: đỏ (logo ~#E31E24). Nền nút dùng sắc đậm hơn (#C8102E) để chữ trắng đạt WCAG AA (~5,9:1).
// primary = hành động chính, accent = thông tin (xanh dương), danger = xóa/lỗi, success, muted = chữ phụ, line = viền ô nhập, surface = nền trang.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#C8102E', dark: '#A30D25', soft: '#FEF1F2', line: '#F4B6BE', brand: '#E31E24' },
        accent: { DEFAULT: colors.sky[700], dark: colors.sky[800], soft: colors.sky[50], line: colors.sky[200] },
        danger: { DEFAULT: colors.red[700], dark: colors.red[800], soft: colors.red[50], line: colors.red[300] },
        success: { DEFAULT: colors.green[800], soft: colors.green[50], line: colors.green[300] },
        muted: colors.gray[600],
        line: colors.stone[300],
        surface: '#F7F5F3',
        ink: colors.slate[900],
      },
      // Gốc 14px: xs = 12px, sm = 13px, base = 14px (chữ chính không nhỏ hơn 12px).
      fontSize: { xs: ['0.8571rem', { lineHeight: '1.15rem' }], sm: ['0.9286rem', { lineHeight: '1.3rem' }] },
      borderRadius: { card: '0.75rem' },
      boxShadow: { card: '0 1px 2px rgb(15 23 42 / 0.05), 0 2px 8px rgb(15 23 42 / 0.06)' },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': { from: { opacity: '0', transform: 'scale(0.97) translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'pop-in': 'pop-in 180ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config

