/**
 * 各 webhook 渠道共用的 JSON POST。
 *
 * 与原 `send()` 内部的内联 post 完全一致：非 2xx 抛 `HTTP <status>`。
 * 错误文案不能改 —— 上层会把它包进 `notifier.sendFailed` 的 message 里对外返回。
 */
export async function postJson(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}
