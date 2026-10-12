import { reactive } from 'vue';

/**
 * 破坏性操作的确认对话框（Design.md §6.1：危险动作要二次确认）。
 *
 * 这里刻意用**模块级单例 + 常驻对话框**，而不是 `useOverlay().create()`：
 *  · 单例让任意页面都能 `await useConfirm()(…)`，不必各自挂一个组件；
 *  · 调用方拿到的是 Promise<boolean>，确认/取消的判断就是一次普通的 await；
 *  · 不依赖 overlay 基础设施，SSR 首帧渲染的是关闭态，也不会有函数进 hydration payload。
 *
 * 对话框本体是 `AppConfirmDialog`，在 `app.vue` 里常驻一份。
 */
export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  /** 确认按钮配色：删除/封禁用 error，普通动作用 primary */
  tone?: 'primary' | 'error';
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  resolve: ((value: boolean) => void) | null;
}

export const confirmState = reactive<ConfirmState>({
  open: false,
  options: null,
  resolve: null,
});

/** 弹一次确认，返回用户是否点了确认。同一时间只允许一个（后来的覆盖前者）。 */
export function useConfirm() {
  return function confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      confirmState.resolve = resolve;
      confirmState.options = options;
      confirmState.open = true;
    });
  };
}

/** 对话框结束后落定结果；由 AppConfirmDialog 调用。 */
export function settleConfirm(value: boolean): void {
  const resolve = confirmState.resolve;
  confirmState.open = false;
  confirmState.options = null;
  confirmState.resolve = null;
  resolve?.(value);
}
