import { vi } from 'vitest'

// D-028: kênh realtime dùng chung — test của trang không mở kết nối thật (mock supabase trong từng test không có channel).
// src/lib/dbChanges.test.ts gọi vi.unmock để thử bản thật.
vi.mock('./lib/dbChanges', () => ({ DB_TABLES: [], useDbChange: () => {} }))
