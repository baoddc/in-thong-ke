/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// .claude/: skill bên ngoài có file *.test.cjs chạy bằng node:test, không phải Vitest.
export default defineConfig({ plugins: [react()], test: { setupFiles: ['src/test-setup.ts'], exclude: [...configDefaults.exclude, '.claude/**'] } })
