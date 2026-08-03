import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri は固定ポートの dev サーバを前提にするため strictPort で起動する
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Rust 側の変更で Vite が再起動しないようにする
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: 'safari15',
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
  },
})
