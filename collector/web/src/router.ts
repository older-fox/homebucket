import { createRouter, createWebHistory } from 'vue-router';

/**
 * 用 history 路由（收集器服务端对非 /api 的 GET 一律回 index.html），
 * 这样条码可以直接做成可分享的地址：/items/<条码>。
 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'search', component: () => import('./views/SearchView.vue') },
    { path: '/items/:barcode', name: 'item', component: () => import('./views/ItemView.vue'), props: true },
    { path: '/stats', name: 'stats', component: () => import('./views/StatsView.vue') },
    { path: '/audit', name: 'audit', component: () => import('./views/AuditView.vue') },
    { path: '/admin', name: 'admin', component: () => import('./views/AdminView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
