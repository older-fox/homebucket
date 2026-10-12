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
      /*
       * 中性色钉到 gray（不是 Nuxt UI 默认的 slate）：规范第 3 节给的中性阶是
       * gray-50/200/500/900，页面里手写的也是 gray-*；用 slate 会让"组件的中性"
       * 与"手写的中性"差一档，同一个徽标和旁边的文字对不上色。
       */
      neutral: 'gray',
      /*
       * 语义色：成功必须是 emerald（不是默认的 green），错误用 red。
       * warning 留给 Nuxt UI 自身的提示态；规范第 6.4 节要求徽标只有"成功=绿、
       * 其余=中性"，所以页面里的状态徽标一律走 success/neutral，不再自造黄色。
       */
      success: 'emerald',
      error: 'red',
      warning: 'amber',
      info: 'blue',
    },
  },
});
