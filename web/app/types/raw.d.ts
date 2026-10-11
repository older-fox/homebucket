/**
 * Vite 的 `?raw` 导入：把文件原文当字符串引进来。
 *
 * API 文档页用 `import md from '~/assets/docs/api.zh-CN.md?raw'` 读 markdown 原文，
 * 再交给 marked 渲染成 HTML。Nuxt 生成的 tsconfig 里 `types: []`，不一定带上
 * vite/client 的 ambient 声明，所以这里自己声明一份。
 */
declare module '*?raw' {
  const content: string;
  export default content;
}
