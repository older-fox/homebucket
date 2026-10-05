export interface NavItem {
  key: string;
  to: string;
  icon: string;
  mobile?: boolean;
}

/** 侧边栏 / 底部 Tab 共用的导航定义（label 用 i18n key 的 nav.* ） */
export function useNav() {
  const items: NavItem[] = [
    { key: 'home', to: '/', icon: 'i-lucide-house', mobile: true },
    { key: 'locations', to: '/locations', icon: 'i-lucide-map-pinned', mobile: true },
    { key: 'items', to: '/items', icon: 'i-lucide-package', mobile: true },
    { key: 'templates', to: '/templates', icon: 'i-lucide-layers' },
    { key: 'settings', to: '/settings', icon: 'i-lucide-settings', mobile: true },
  ];

  return {
    items,
    mobileItems: items.filter((item) => item.mobile),
    isActive: (item: NavItem, path: string) =>
      item.to === '/' ? path === '/' : path === item.to || path.startsWith(`${item.to}/`),
  };
}
