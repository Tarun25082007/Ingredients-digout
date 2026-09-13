import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isDocker = env.DOCKER_ENV === 'true';

  const plugins = [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Digout Health',
        short_name: 'Digout',
        description: 'Scan and analyze ingredients against WHO guidelines',
        theme_color: '#064e3b',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module',
      }
    })
  ];

  if (!isDocker) {
    plugins.push(mkcert());
  }

  return {
    plugins,
    server: {
      proxy: {
        '/api': {
          target: isDocker ? 'https://digout-backend:8443' : 'https://localhost:8443',
          changeOrigin: true,
          secure: false, // Bypass SSL verification for the backend's self-signed cert
        }
      }
    }
  }
})
