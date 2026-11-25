import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Frilly's sign-in trusts http://localhost:3000, so that is the default.
    // GALA_DEV_PORT runs a second copy beside it (previews only; no sign-in).
    port: Number(process.env.GALA_DEV_PORT ?? 3000),
    strictPort: true,
    // In development the engine still runs on the Sprite (the model
    // connectors answer only there). `sprite proxy 8080` brings its port
    // to this machine, and /api is passed through to it. GALA_API_PROXY
    // names another engine.
    proxy: { "/api": { target: process.env.GALA_API_PROXY ?? "http://127.0.0.1:8080", changeOrigin: false } },
  },
});
