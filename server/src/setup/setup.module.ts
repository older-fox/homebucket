import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { SetupAdminController } from './setup-admin.controller';
import { SetupDatabaseController } from './setup-database.controller';
import { SetupGateGuard } from './setup-gate.guard';
import { SetupService } from './setup.service';
import { SetupStateService } from './setup-state.service';
import { SetupStatusController } from './setup-status.controller';

/**
 * 引导（正常模式的那一半）：需要数据库，因为它要读写"初始化是否完成"这个标记。
 *
 * 受限启动用的那一半在 `setup-restricted.module.ts`，两者共用 `SetupService`
 * 与 `SetupDatabaseController`（都不依赖数据库）。哪个根模块被加载由 `main.ts`
 * 的探测结果决定，一次只会加载一个。
 *
 * 门禁 `SetupGateGuard` 挂成 APP_GUARD：它只管"有没有完成引导"，与业务鉴权无关，
 * 所以放全局比逐控制器挂更好 —— 以后新增控制器也不可能漏掉。
 *
 * 引入 `AuthModule` 只为建第一个账号（`AuthService.createInitialAdmin`）：
 * 那里已经有密码哈希、个人家庭创建、JWT 签发这些逻辑，重写一份只会走偏。
 */
@Module({
  imports: [AuthModule],
  controllers: [SetupDatabaseController, SetupStatusController, SetupAdminController],
  providers: [SetupService, SetupStateService, { provide: APP_GUARD, useClass: SetupGateGuard }],
  exports: [SetupStateService],
})
export class SetupModule {}
