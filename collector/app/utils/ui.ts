/**
 * 原生表格的共享 class（Design.md：表格保持原生 DOM，不组件化 —— e2e 直接读 tbody tr/td）。
 *
 * 卡片面与 `hb-card` 一致（rounded-2xl + 淡 ring + 半透明底 + 轻阴影），只是外加
 * `overflow-hidden`，让表头/表体在圆角内被裁切。
 */
export const tableWrap = 'hb-card overflow-hidden';

/** 需要横向滚动时套在 table 外层的容器 */
export const tableScroll = 'overflow-x-auto';

/** 表头单元格：规范的小标签样式（12 / medium / uppercase / 灰） */
export const tableHead =
  'bg-gray-50/80 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:bg-gray-900/60 dark:text-gray-400';

/** 表体单元格：正文 14px，次色 */
export const tableCell = 'px-4 py-3 align-top text-sm text-gray-700 dark:text-gray-300';
