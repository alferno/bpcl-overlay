import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/broadcast-api-proxy": {
        target: process.env.ADMIN_BACKEND_PROXY ?? "http://127.0.0.1:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/broadcast-api-proxy/, ""),
      },
    },
  },
});
