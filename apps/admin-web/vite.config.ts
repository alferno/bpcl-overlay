import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/admin/' : '/',
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: process.env.ADMIN_BACKEND_PROXY ?? "http://127.0.0.1:8080",
        changeOrigin: true,
      },
      "/socket.io": {
        target: process.env.ADMIN_BACKEND_PROXY ?? "http://127.0.0.1:8080",
        changeOrigin: true,
        ws: true,
      }
    },
  },
}));
