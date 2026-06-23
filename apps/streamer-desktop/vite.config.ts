import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['@ngrok/ngrok', 'broadcast-api', 'obs-websocket-js', 'express', 'socket.io', 'ioredis', 'dotenv', 'pino', 'zod', 'cors', 'helmet', 'bottleneck']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: 'cjs'
              }
            }
          }
        }
      },
    ]),
    renderer(),
  ],
})
