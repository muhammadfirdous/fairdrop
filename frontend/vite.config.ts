import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.FAIRDROP_WEB_PORT || 5174),
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.FAIRDROP_API_PORT || 8000}`,
        changeOrigin: false,
      },
    },
  },
});
