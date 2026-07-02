import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api/youdao': {
        target: 'https://dict.youdao.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/youdao/, '/jsonapi_s'),
        headers: {
          Referer: 'https://dict.youdao.com/',
        },
      },
      '/api/iciba': {
        target: 'https://dict.iciba.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/iciba/, ''),
      },
    },
  },
})
