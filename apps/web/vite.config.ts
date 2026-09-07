import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = {
  '/api': {
    target: `http://localhost:${process.env.API_PORT ?? 3000}`,
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@im-coupon/contracts'],
  },
  server: { port: 5173, proxy },
  preview: { port: 5173, proxy },
});
