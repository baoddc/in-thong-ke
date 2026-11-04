import { vi } from 'vitest'

// D-028: kênh realtime dùng chung — test của trang không mở kết nối thật (mock supabase trong từng test không có channel).
// src/lib/dbChanges.test.ts gọi vi.unmock để thử bản thật.
vi.mock('./lib/dbChanges', () => ({ DB_TABLES: [], useDbChange: () => {} }))

// D-029: mặc định không có phiếu/dòng thiếu (không bị khóa). IncompleteNotice.test.tsx gọi vi.unmock để thử bản thật.
vi.mock('./lib/useIncomplete', () => ({
  BLOCKED_MSG: 'Bạn còn phiếu/dòng quá 24 giờ chưa điền đủ thông tin. Hãy điền đủ trước khi thao tác khác.',
  useIncomplete: () => ({ items: [], blocked: false, has: () => false }),
}))
