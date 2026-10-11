import { env } from '../utils/env';
import { initDatabase } from '../database/db';

/**
 * 启动时把数据库准备好（迁移 + 连接 + pragma）。
 *
 * 放在 Nitro 插件里而不是各路由的懒加载里：库没准备好就该**启动失败**，
 * 而不是等第一个请求进来才 500 —— 后者在容器编排里会被当成"启动成功但一直报错"。
 */
export default defineNitroPlugin(async () => {
  const dataSource = await initDatabase();
  console.log(
    `[collector] v${env.version} 数据库就绪：${dataSource.options.database as string}` +
      `（autoMigrate=${env.autoMigrate}，注册${env.registrationOpen ? '开放' : '已关闭'}）`,
  );
});
