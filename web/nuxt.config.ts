import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

const rootDir = dirname(fileURLToPath(import.meta.url));

// 环境变量统一放在仓库根目录的 .env，Nuxt 默认只读取自身目录，这里显式加载
loadEnv({ path: resolve(rootDir, '../.env') });

// WEB_HOST 默认 0.0.0.0：允许局域网 / 容器外访问
const host = process.env.WEB_HOST ?? '0.0.0.0';
const port = Number(process.env.WEB_PORT ?? 3000);
const apiProxyTarget = (process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001').replace(/\/+$/, '');

export default defineNuxtConfig({
  devtools: { enabled: true },
  ssr: true,

  devServer: { host, port },

  app: {
    head: {
      title: 'Homebucket',
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    },
  },

  runtimeConfig: {
    // 仅服务端可见（SSR 直连后端）
    apiBase: process.env.NUXT_API_BASE ?? `${apiProxyTarget}/api`,
    // 浏览器端可见：默认 /api，走下面的 nitro 代理，同源因此不存在跨域问题
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? '/api',
    },
  },

  // 把 /api 代理到 Nest：前端 0.0.0.0 对外后，浏览器始终同源访问，跨域问题从根上消失
  routeRules: {
    '/api/**': { proxy: `${apiProxyTarget}/api/**` },
  },
});
