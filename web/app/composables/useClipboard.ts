/**
 * 复制到剪贴板。
 *
 * 物品表单（复制追溯码）、扫码浮窗（复制码）、设置页（复制邀请链接）原来各写了一份几乎一样的
 * try/catch + toast，差别只在"复制失败怎么办"。统一到这里：
 *   · 成功 → toast「已复制」；
 *   · 失败（无剪贴板权限 / 非 https 环境）→ 默认把内容原样弹成 info toast，至少能手动抄；
 *     需要长文本可选中时（例如邀请链接）传 `fallback: 'prompt'`，退回系统输入框。
 * 返回值表示是否真的写进了剪贴板，调用方需要额外行为时可以据此判断。
 */
export function useClipboard() {
  const { t } = useI18n();
  const toast = useToast();

  async function copy(text: string, options: { fallback?: 'toast' | 'prompt' } = {}) {
    try {
      await navigator.clipboard.writeText(text);
      toast.add({ title: t('common.copied'), color: 'success' });
      return true;
    } catch {
      if (options.fallback === 'prompt') window.prompt(t('common.copy'), text);
      else toast.add({ title: text, color: 'info' });
      return false;
    }
  }

  return { copy };
}
