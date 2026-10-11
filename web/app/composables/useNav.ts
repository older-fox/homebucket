export interface NavItem {
  key: string;
  to: string;
  icon: string;
  /** 是否出现在移动端底部 Tab（设置等次级页面收纳进「更多」） */
  mobile?: boolean;
}

/** 底部 Tab 中间的扫码入口 */
export const SCAN_ITEM: NavItem = { key: 'scan', to: '/scan', icon: 'i-lucide-scan-line' };

/** 侧边栏 / 底部 Tab 共用的导航定义（label 用 i18n key 的 nav.* ） */
export function useNav() {
  const items: NavItem[] = [
    { key: 'home', to: '/', icon: 'i-lucide-house', mobile: true },
    { key: 'locations', to: '/locations', icon: 'i-lucide-map-pinned', mobile: true },
    { key: 'items', to: '/items', icon: 'i-lucide-package', mobile: true },
    { key: 'templates', to: '/templates', icon: 'i-lucide-layers' },
    // 操作历史收进桌面侧栏与移动端「更多」抽屉（不设 mobile，避免底部 Tab 挤成 2/2/扫码/more 之外）
    { key: 'activity', to: '/activity', icon: 'i-lucide-history' },
    { key: 'settings', to: '/settings', icon: 'i-lucide-settings', mobile: false },
  ];

  return {
    items,
    mobileItems: items.filter((item) => item.mobile),
    isActive: (item: NavItem, path: string) =>
      item.to === '/' ? path === '/' : path === item.to || path.startsWith(`${item.to}/`),
  };
}
