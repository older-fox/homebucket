import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * 前端源码在 web/，构建产物进 public/ —— 服务端启动时直接托管这个目录（同进程，无跨域、无反向代理）。
 * 开发时用 vite 的 dev server（默认 3401，避开 HomeBucket 自己的 3000/3001），
 * 它把 /api 代理到正在跑的收集器服务（默认 3400）。
 */
export default defineConfig({
  root: fileURLToPath(new URL('./web', import.meta.url)),
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./web', import.meta.url)) },
  },
  build: {
    // 产物交给服务端托管（env.ts 的 COLLECTOR_WEB_DIR 默认就是 public）
    outDir: fileURLToPath(new URL('./public', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: Number(process.env.COLLECTOR_WEB_PORT ?? 3401),
    proxy: {
      '/api': {
        target: process.env.COLLECTOR_API ?? 'http://127.0.0.1:3400',
        changeOrigin: true,
      },
    },
  },
});
