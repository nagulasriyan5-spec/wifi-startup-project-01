import path from "path"
const __dirname = import.meta.dirname
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const localEnv = loadEnv(mode, __dirname, "");
  const backendUrl =
    localEnv.VITE_BACKEND_URL ||
    localEnv.BACKEND_URL ||
    `http://127.0.0.1:${localEnv.PORT || "4000"}`;
  const viteCacheDir =
    localEnv.VITE_CACHE_DIR ||
    process.env.SRIYAN_VITE_CACHE_DIR ||
    (process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Sriyan", "vite-cache")
      : path.resolve(__dirname, ".vite-cache"));

  return {
    root: path.resolve(__dirname, "frontend"),
    cacheDir: viteCacheDir,
    plugins: [react()],
    server: {
      port: 5175,
      strictPort: true,
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./frontend"),
        "@contracts": path.resolve(__dirname, "./contracts"),
        "@db": path.resolve(__dirname, "./database"),
        "db": path.resolve(__dirname, "./database"),
      },
    },
    envDir: path.resolve(__dirname),
    build: {
      outDir: path.resolve(__dirname, "dist/public"),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router"],
            trpc: [
              "@tanstack/react-query",
              "@trpc/client",
              "@trpc/react-query",
              "@trpc/server",
              "superjson",
            ],
            charts: ["recharts"],
            motion: ["framer-motion"],
            ui: ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu"],
          },
        },
      },
    },
  };
});
