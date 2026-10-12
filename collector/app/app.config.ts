/**
 * Nuxt UI 主题映射。
 *
 * 只做一件事：把组件库的语义色**钉到设计规范的那一档**上。
 * 规范说"全站只有一种品牌色（蓝），语义色仅用于状态"，于是：
 *   · primary = blue（blue-600 为基准，悬浮走 blue-700）
 *   · 中性色交给 Nuxt UI 默认的 slate/gray 阶梯，不再另起一套
 *
 * 不在这里写任何组件级的 color/size 默认值 —— 那些是**页面上下文**决定的
 * （登录页的主按钮要 size=lg + block，表格里的危险按钮要 size=xs），
 * 统一塞进全局默认值只会让个别页面为了纠正它再写一堆覆盖。
 */
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'slate',
    },
  },
});
