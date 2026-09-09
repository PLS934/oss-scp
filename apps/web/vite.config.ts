import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, '../..', ''), ...process.env };
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      watch: { usePolling: env.WATCH_POLLING === 'true' },
      proxy: {
        '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:3000' },
      },
    },
  };
});
