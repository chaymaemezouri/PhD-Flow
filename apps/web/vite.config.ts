import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(import.meta.dirname, '../..');
  const env = loadEnv(mode, envDir, '');
  return {
    envDir,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_DEV_API_PROXY || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
