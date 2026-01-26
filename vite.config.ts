import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [tailwindcss(), react()],
    // Note: API_KEY is no longer exposed to the frontend - it's only used server-side
    server: {
      host: '0.0.0.0',
      port: 5173, // Use Vite's default port for dev
      allowedHosts: true,
      proxy: {
        // Proxy API requests to the backend server
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        // Proxy WebSocket connections to the backend server
        '/ws': {
          target: 'ws://localhost:3001',
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});
