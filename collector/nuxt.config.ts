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
  /*
   * Nuxt UI v4 提供组件（UButton/UInput/UCard/UBadge/UAlert…），
   * i18n 管文案。两者都在构建期展开，不引入额外的运行时请求。
   */
  modules: ['@nuxtjs/color-mode', '@nuxt/ui', '@nuxtjs/i18n'],
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  devtools: { enabled: false },
  devServer: { port, host },
  /*
   * i18n：默认中文，策略是 no_prefix —— 收集器是内网自用工具，
   * URL 上出现 /zh/ 这种前缀只会让老实例的文档链接失效，
   * 语言选择走 cookie/浏览器偏好即可（顶栏有切换控件）。
   */
  i18n: {
    defaultLocale: 'zh',
    strategy: 'no_prefix',
    locales: [
      { code: 'zh', name: '中文', file: 'zh.json' },
      { code: 'en', name: 'English', file: 'en.json' },
    ],
    detectBrowserLanguage: { useCookie: true, cookieKey: 'hb-collector-locale', redirectOn: 'root' },
  },
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
    /**
     * 全站登录守卫在 `app/middleware/login-gate.global.ts`。
     *
     * **不要**在这里写 `middleware: ['login-gate']`：`app.middleware` 只接受
     * 生成器注入的中间件条目，手写名字只会把它注册成**具名**中间件（无人引用），
     * `globalMiddleware` 里留下的那个空函数就是它 —— 守卫不会执行。
     * Nuxt 判定全局的唯一依据是文件名以 `.global.ts` 结尾。
     * 存这条注释是因为这里已经踩过一次坑，删掉注释很容易再写回来。
     */
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
