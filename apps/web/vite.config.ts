import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const proxy = {
  '/api': {
    target: `http://localhost:${process.env.API_PORT ?? 3000}`,
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  // 개발 서버는 워크스페이스의 오래된 dist가 아니라 계약 타입 원본을 본다.
  resolve: {
    alias: {
      '@im-coupon/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  server: { port: 5173, proxy },
  preview: { port: 5173, proxy },
});
