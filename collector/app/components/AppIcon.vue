<script setup lang="ts">
/**
 * 内联 SVG 图标集。
 *
 * 规范第 8 节：图标一律内联 `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">`，
 * 线性风格（stroke 而非 fill），尺寸 `1em` 跟随当前字号、`currentColor` 继承文字色。
 *
 * ── 为什么不用图标库 ──
 * 收集器常部署在没有外网的局域网里。图标字体/运行时图标集在离线环境中会整片变成
 * 方块或直接不渲染，而界面上的图标承担的是导航识别（"这一项是审计还是纠错台"），
 * 挂掉就等于没有导航。内联 SVG 进构建产物，离线一定在。
 *
 * 用法：`<AppIcon name="search" class="h-[18px] w-[18px]" />`
 * 装饰性图标默认 `aria-hidden="true"`（图标旁边都有文字）；纯图标按钮由**调用方**
 * 在外层给 `aria-label`，见规范 6.1。
 */
/**
 * 只放路径数据，不重复写 <svg> 外壳 —— 五个属性（viewBox/fill/stroke/线帽/线连接）
 * 在每个图标上都一样，重复二十遍只会有一处写错的机会。
 */
const PATHS = {
  search: 'M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  clipboard: 'M9 4h6v2H9V4zM7 6H6a2 2 0 00-2 2v11a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-1M9 12h6M9 16h4',
  wrench: 'M14.7 6.3a4 4 0 105.3 5.3l-2.1-2.1M14.7 6.3L4 17v3h3L17.7 9.3M14.7 6.3l2.1-2.1 3.9 3.9-2.1 2.1',
  shield: 'M12 3l7 3v5c0 4.4-2.9 8.3-7 9.9C7.9 19.3 5 15.4 5 11V6l7-3z',
  box: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M6 6L4.5 4.5M19.5 19.5L18 18M6 18l-1.5 1.5M19.5 4.5L18 6M16 12a4 4 0 11-8 0 4 4 0 018 0z',
  moon: 'M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v10H5V11z',
  key: 'M15 7a4 4 0 11-3.3 6.2L9 16H7v2H5v2H2v-3l7.8-7.8A4 4 0 0115 7z',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3a14 14 0 010 18 14 14 0 010-18z',
  check: 'M20 6L9 17l-5-5',
  plus: 'M12 5v14M5 12h14',
  refresh: 'M21 12a9 9 0 11-2.6-6.4M21 4v5h-5',
  ban: 'M12 21a9 9 0 100-18 9 9 0 000 18zM5.6 5.6l12.8 12.8',
  merge: 'M8 3v6a4 4 0 004 4h4M8 21v-6a4 4 0 014-4M16 17l4-4-4-4',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16v-5M12 8h.01',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  copy: 'M9 9h10v12H9V9zM5 15H3V3h12v2',
  database: 'M12 8c5 0 9-1.1 9-2.5S17 3 12 3 3 4.1 3 5.5 7 8 12 8zM3 5.5v13C3 19.9 7 21 12 21s9-1.1 9-2.5v-13M3 12c0 1.4 4 2.5 9 2.5s9-1.1 9-2.5',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  image: 'M3 5h18v14H3V5zM3 16l5-5 4 4 3-3 6 6M9 9h.01',
  scales: 'M12 4v16M7 20h10M5 7h14M5 7l-3 7h6L5 7zM19 7l-3 7h6l-3-7z',
  filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5z',
  external: 'M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
} as const;

export type IconName = keyof typeof PATHS;

const props = withDefaults(
  defineProps<{
    name: IconName;
    /** 线宽。规范给 1.8~2；紧凑行 1.8，导航/输入框 2 */
    strokeWidth?: number;
  }>(),
  { strokeWidth: 1.8 },
);
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="props.strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="PATHS[props.name]" />
  </svg>
</template>
