import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      port: parseInt(env.VITE_PORT || '5173', 10),
      strictPort: true,
      proxy: {
        // Proxy API requests to the backend
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          secure: false,
          ws: true
        },
        // Proxy Socket.IO
        '/socket.io': {
          target: env.VITE_API_URL || 'http://localhost:3000',
          ws: true,
          changeOrigin: true
        }
      }
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    // Ensure environment variables are loaded in the client
    define: {
      'process.env': {}
    },
    build: {
      target: 'esnext',
      sourcemap: env.VITE_DEBUG === 'true',
      minify: env.NODE_ENV === 'production' ? 'esbuild' : false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            vendor: ['socket.io-client']
          }
        }
      }
    }
  };
});
