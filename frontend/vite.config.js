import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In split development the browser still calls relative /api URLs.  Without
// this proxy Vite returns index.html for a route/geocode request, which then
// surfaces as a misleading JSON parsing error in the map UI.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  const backendTarget = env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
