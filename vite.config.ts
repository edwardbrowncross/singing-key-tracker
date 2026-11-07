/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/singing-key-tracker/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
  },
})
