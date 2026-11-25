import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    // In development the engine still runs on the Sprite (the model
    // connectors answer only there). `sprite proxy 8080` brings its port
    // to this machine, and /api is passed through to it.
    proxy: { "/api": { target: "http://127.0.0.1:8080", changeOrigin: false } },
  },
});
