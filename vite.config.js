import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// OpenSky Network API は自ドメインからのリクエストしか CORS 許可しないため、
// dev サーバー側でプロキシして同一オリジン化する。
// ブラウザは /opensky/... に投げ、Vite が https://opensky-network.org/... へ転送する。
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/opensky': {
        target: 'https://opensky-network.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/opensky/, ''),
      },
    },
  },
})
