import tailwindcss from '@tailwindcss/vite';

/**
 * Nuxt 配置。收集器是"一个进程同时提供 SSR 页面与 API"的服务：
 *   · 页面：Nuxt 自己（app/）
 *   · API：Nitro 的 server/api（挂载在 /api/**，老实例契约要求这个前缀）
 *
 * 端口从 COLLECTOR_PORT 读（与迁移前保持一致，部署脚本、健康检查、文档都不用改）；
 * Nitro 自己认的是 PORT/NITRO_PORT，所以 scripts/start.mjs 负责把两者接起来。
 */
const port = Number(process.env.COLLECTOR_PORT ?? 3400);
const host = process.env.COLLECTOR_HOST?.trim() || '0.0.0.0';

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  modules: ['@nuxtjs/color-mode'],
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  devtools: { enabled: false },
  devServer: { port, host },
  /**
   * 深色模式跟着系统走，classSuffix 留空 → 挂在 <html class="dark"> 上，
   * 这样 Tailwind v4 的 dark: 变体（@custom-variant 里声明的是 .dark）直接可用。
   */
  colorMode: {
    preference: 'system',
    fallback: 'light',
    classSuffix: '',
    storageKey: 'hb-collector-color-mode',
  },
  app: {
    head: {
      title: 'HomeBucket 收集器',
      titleTemplate: '%s · HomeBucket 收集器',
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: '所有 HomeBucket 实例共享的物品资料库：按条码查询任何人都能补充的公共资料。',
        },
      ],
    },
  },
  typescript: { strict: true },
  nitro: {
    // 单进程 node-server（默认 preset）。better-sqlite3 是原生模块，
    // Nitro 会把它作为外部依赖 trace 进 .output/server/node_modules，不打进 bundle。
    experimental: { openAPI: false },
  },
});
