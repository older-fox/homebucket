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
  },
});
