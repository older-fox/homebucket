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
  modules: ['@nuxt/ui', '@nuxtjs/i18n'],
  // 关闭 @nuxt/fonts：不依赖 Google Fonts 等外部字体服务，改用系统字体栈（离线也能跑）
  ui: { fonts: false },
  icon: {
    // 图标集装到本地（@iconify-json/lucide），不依赖 Iconify 在线接口
    serverBundle: 'local',
    // 默认的 /api/_nuxt_icon 会被下面的 /api/** 代理转发到 Nest，换成独立路径
    localApiEndpoint: '/_nuxt_icon',
    // 全部图标本地托管：禁用公共 Iconify API 回退，避免任何外部 CDN 请求
    fallbackToApi: false,
    clientBundle: {
      scan: true,
      includeCustomCollections: true,
    },
  },
  devtools: { enabled: true },
  ssr: true,
  css: ['~/assets/css/main.css'],

  // 深浅色：跟随系统，用户可手动切换并记住（html 上加 .dark 类）
  colorMode: {
    preference: 'system',
    fallback: 'light',
    classSuffix: '',
    storageKey: 'hb-color-mode',
  },

  devServer: { host, port },

  app: {
    head: {
      title: 'Homebucket',
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#1b7f74' },
      ],
    },
  },

  i18n: {
    defaultLocale: 'zh-CN',
    strategy: 'no_prefix',
    locales: [
      { code: 'zh-CN', name: '简体中文', file: 'zh-CN.json' },
      { code: 'en', name: 'English', file: 'en.json' },
    ],
    langDir: 'locales',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'hb_locale',
      redirectOn: 'root',
      fallbackLocale: 'zh-CN',
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
