/**
 * SSR 阶段为 false、客户端挂载后置为 true 的"已水合"标志。
 *
 * 为什么需要它：页面上 `useAsyncData(..., { server: false })` 的请求只在客户端发，
 * 于是同一份模板在两次渲染里走的分支不同 ——
 *   · SSR：pending 仍是 false、data 是 default 空值 → 渲染"空状态"
 *   · 客户端首次渲染：请求刚发出、pending === true → 渲染骨架
 * 分支不同就会报 "Hydration children/class mismatch"（Vue 只在开发期提示，生产不修正，
 * 结果是一闪而过的错位）。
 *
 * 用法：把 `v-if="pending"` 改成 `v-if="pending || !hydrated"`，
 * 让 SSR 与客户端首渲染都先走骨架分支，挂载后再切到真实分支。
 */
export function useHydrated() {
  const hydrated = ref(false);
  onMounted(() => {
    hydrated.value = true;
  });
  return hydrated;
}
