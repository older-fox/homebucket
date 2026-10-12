import { env } from '../utils/env';
import { SyncService } from '../services/sync.service';

/**
 * 定时把"拥有条码的条目"全量上行到上级数据库（用户需求④）。
 *
 * ── 为什么定时器放插件里 ──
 * 这是**进程级**行为（"这个收集器多久往外送一次"），不是某个请求的副作用。
 * 放在插件里生命周期跟进程一致，也不会因为没人访问接口就不跑 —— 需求要的正是
 * "无人值守地持续上传"。
 *
 * ── 为什么没配就完全不启动 ──
 * `transport=off`（默认）时连定时器都不建：一段永远走不到的空跑循环，只会让日志
 * 里反复出现"同步了 0 条"，把真正的问题淹掉。界面上会明确显示"未配置"。
 *
 * ── 为什么用递归 setTimeout 而不是 setInterval ──
 * 一轮同步可能比间隔还久（对方慢、条目多）。`setInterval` 会在这时叠起第二个并发轮次，
 * 同一批条目被两个轮次同时标记，成功率与账本都会错乱。递归 `setTimeout` 保证
 * "上一轮结束后才开始倒计时下一轮"，天然串行。
 *
 * ── 为什么每轮都重读配置 ──
 * 间隔值在启动时读一次就固化了；这里每轮现取，使得容器里改环境变量重启后
 * 立刻生效，也让将来"管理端临时改间隔"有落点。
 */
export default defineNitroPlugin((nitroApp) => {
  if (env.sync.transport === 'off') {
    console.log('[collector] 上行同步未启用（COLLECTOR_SYNC_TRANSPORT=off），仅提供导出接口');
    return;
  }
  if (env.sync.intervalMinutes <= 0) {
    console.log(
      '[collector] 上行同步已配置传输但间隔为 0：不自动同步，仅支持管理端手动触发',
    );
    return;
  }

  const intervalMs = env.sync.intervalMinutes * 60_000;
  const service = new SyncService();
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const schedule = (): void => {
    if (stopped) return;
    timer = setTimeout(run, intervalMs);
    // 定时器不该拖住进程退出：容器收到 SIGTERM 时要能立刻停
    timer.unref?.();
  };

  const run = async (): Promise<void> => {
    try {
      const result = await service.run();
      if (result.scanned > 0 || result.failed > 0) {
        console.log(
          `[collector] 上行同步：扫描 ${result.scanned} 条，发送 ${result.sent} 条，` +
            `跳过 ${result.skipped} 条，失败 ${result.failed} 条`,
        );
      }
      for (const error of result.errors.slice(0, 5)) {
        console.warn(`[collector] 上行同步失败 ${error.barcode}（#${error.itemId}）：${error.message}`);
      }
    } catch (error) {
      // 一轮崩掉不能让定时器死掉 —— 那种"启动时正常、三天后静默不动"最难发现
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[collector] 上行同步本轮异常：${message}`);
    } finally {
      schedule();
    }
  };

  console.log(
    `[collector] 上行同步已启用：transport=${env.sync.transport}，` +
      `每 ${env.sync.intervalMinutes} 分钟一轮，每批 ${env.sync.batchSize} 条` +
      `${env.sync.includePhotos ? '（含图片 URL）' : '（不含图片）'}`,
  );

  // 首轮延迟一个间隔再跑：启动瞬间往往数据库刚迁移完、对方也刚起来，
  // 立刻发一批的意义不大，反而容易在部署时立刻记一堆失败。
  schedule();

  nitroApp.hooks.hook('close', () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  });
});
