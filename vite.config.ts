import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/travel.svg'],
      manifest: {
        name: '여행잇다 · DK Travel Helper',
        short_name: '여행잇다',
        description: '여행 계획과 여행 중 필요한 정보를 이어주는 앱',
        lang: 'ko-KR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f6f8f4',
        theme_color: '#f6f8f4',
        icons: [
          {
            src: '/icons/travel.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}'],
      },
    }),
  ],
})
