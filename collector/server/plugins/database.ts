import { env } from '../utils/env';
import { initDatabase } from '../database/db';
import { AuthService } from '../services/auth.service';

/**
 * 启动时把数据库准备好（迁移 + 连接 + pragma），并按 .env 引导管理员账号。
 *
 * 放在 Nitro 插件里而不是各路由的懒加载里：库没准备好就该**启动失败**，
 * 而不是等第一个请求进来才 500 —— 后者在容器编排里会被当成"启动成功但一直报错"。
 *
 * 管理员账号在"库里一个都没有"时按 COLLECTOR_ADMIN_* 创建（需求：初始化时直接创建）。
 * 已有账号时 .env 里的口令**不再生效** —— 否则在界面上改过的密码会被下次重启改回去；
 * 忘了密码用 COLLECTOR_ADMIN_FORCE_RESET=true 显式重置（见 README）。
 * 这几种情形都在启动日志里说清楚，避免"我明明配了口令却登不上"的无解排查。
 */
export default defineNitroPlugin(async () => {
  const dataSource = await initDatabase();
  console.log(
    `[collector] v${env.version} 数据库就绪：${dataSource.options.database as string}` +
      `（autoMigrate=${env.autoMigrate}，注册${env.registrationOpen ? '开放' : '已关闭'}）`,
  );

  const bootstrap = await new AuthService(dataSource).bootstrapAdmin();
  if (bootstrap.created) {
    console.log(
      `[collector] 已按 .env 创建管理员账号 ${bootstrap.username}` +
        '（口令只存 scrypt 哈希，可在纠错台修改）',
    );
    return;
  }
  if (bootstrap.reset) {
    console.log(
      `[collector] COLLECTOR_ADMIN_FORCE_RESET=true：已用 .env 里的口令重置管理员 ${bootstrap.username}，并作废其全部登录会话`,
    );
    return;
  }
  console.log(
    `[collector] 管理员账号 ${bootstrap.username} 已存在，忽略 .env 里的初始口令（改密码请在纠错台操作）`,
  );
});
