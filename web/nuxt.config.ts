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

  // 不产出服务端 sourcemap：默认 sourcemap.server 为 true，会在 .output/server 下生成近百个 .map
  // （体积约占服务端产物大头，生产环境也不需要）。client 保持默认（构建时为 false）。
  sourcemap: { server: false },

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

  // 绕开上游的一个 dev 启动报错（只影响 dev 冷启动，构建与 CI 都不跑这个扫描）。
  //
  // 现象：冷启动 dev（或清掉 node_modules/.cache/vite 后重启）时打印
  //   ERROR (!) Failed to run dependency scan. Skipping dependency pre-bundling.
  //   [plugin vite:dep-scan:resolve] Error: Missing "#components" specifier in "@nuxtjs/i18n" package
  // 原因：依赖预扫描读到 @nuxtjs/i18n 运行时组件里的 `import { NuxtLink } from '#components'`。
  //   `#components` 是 Nuxt 的虚拟模块，只在 transform 阶段被重写成真实导入；扫描阶段不跑
  //   transform，裸 `#` 说明符就落到 Node 的 package imports 解析，@nuxtjs/i18n 的 imports 里
  //   没有 `#components`，于是直接抛错，整个扫描失败（随之丢掉预打包，dev 首次访问变慢）。
  // 为什么这样修：全依赖树里只有
  //   @nuxtjs/i18n/dist/runtime/components/NuxtLinkLocale.js
  // 这一处这样导入，而本项目（web/ 下）没有任何地方用到 NuxtLinkLocale / SwitchLocalePathLink，
  // 所以在扫描时把 `#components` 当外部依赖跳过是安全的：扫描通过，42 个依赖照常预打包，
  // 产物里不含 `#components`。曾试过 optimizeDeps.exclude: ['@nuxtjs/i18n'] —— 实测无效，
  // exclude 只过滤「被爬到的依赖」，拦不住扫描对 `#` 说明符的解析；optimizeDeps.noDiscovery
  // 虽不报错但会完全关掉预打包，代价更大。
  // 上游 nuxt 4.6.0 + @nuxtjs/i18n 10.6.0 + vite 8.3.2（rolldown 1.2.12/1.2.13）均已是各自
  // 最新版，问题仍在：nuxt/nuxt#33032 与提交 32d5655 只处理了「包自己在 imports 里声明
  // #components」的情形。等上游修好后可以删掉这段配置。
  vite: {
    optimizeDeps: {
      rollupOptions: {
        external: ['#components'],
      },
    },
  },
});
