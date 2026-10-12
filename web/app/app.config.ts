// 全站视觉基线：品牌色（teal 主色 + 琥珀强调）、统一控件尺寸
// 页面里请使用 CSS 变量（--hb-*，见 app/assets/css/main.css），深浅色自动适配
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'teal',
      neutral: 'slate',
    },
    button: {
      defaultVariants: {
        size: 'md',
      },
    },
    input: {
      defaultVariants: {
        size: 'md',
      },
    },
    select: {
      defaultVariants: {
        size: 'md',
      },
    },
    card: {
      slots: {
        root: 'rounded-[18px]',
      },
    },
    /**
     * 消息通知条统一从**顶部中间**弹出。
     *
     * 必须写进 `defaultVariants`，不能写成 `toaster: { position: 'top-center' }`：
     * Nuxt UI 的 `useComponentProps` 只在 `defaultVariants` 里找组件 prop 的默认值，
     * 直接写在组件名下会被当成主题 variants，只改到 viewport 的 class，
     * 而 `Toaster` 内部的滑动方向、上下偏移仍按默认（右下）算。
     */
    toaster: {
      defaultVariants: {
        position: 'top-center',
      },
    },
  },
});
