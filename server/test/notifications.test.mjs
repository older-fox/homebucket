/**
 * 「取走过久」提醒与账号资料接口的契约护栏（node:test，零依赖，读源码断言）。
 *
 * 守的几条：
 *   1. 提醒是**按需计算**的 —— 仓库里唯一的定时任务在 src/collection/（条码全量上报），
 *      scheduler 不得扩散到别处（否则要部署定时任务、还要处理多实例重复推送）；
 *   2. 已遗失 / 已软删除的东西不该继续提醒（否则用户"处理过了"还会被反复骚扰）；
 *   3. 阈值 0 = 关闭提醒，不能因为 0 是 falsy 就回落到默认 7 天；
 *   4. 头像只能指向自己有权限的附件（Attachment 是家庭维度的表）。
 *
 * 运行：cd server && npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = fileURLToPath(new URL('..', import.meta.url));

const read = (relative) => readFileSync(join(SERVER_ROOT, relative), 'utf8');

/** 递归列出目录下所有 .ts（用来做"某个依赖只允许出现在某处"这类收口断言） */
function listTs(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTs(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function methodBody(source, signature, label) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `找不到方法：${label}`);
  const open = source.indexOf('{', start + signature.length);
  assert.notEqual(open, -1, `找不到方法体：${label}`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  assert.fail(`方法体没有闭合：${label}`);
}

test('提醒接口：家庭级守卫 + 按需计算，不引 scheduler', () => {
  const controller = read('src/notifications/notifications.controller.ts');
  assert.match(controller, /@FamilyScoped\(\)/, '提醒接口必须走家庭上下文（否则会读到别人家数据）');
  assert.match(controller, /@Get\('overdue'\)/, '提醒路由名变了：前端与文档都按 /notifications/overdue 写的');

  // 没有 scheduler / cron / 推送队列：提醒在请求时算，前端轮询即可
  for (const file of readdirSync(join(SERVER_ROOT, 'src/notifications'))) {
    const source = read(join('src/notifications', file));
    assert.ok(
      !/from '@nestjs\/schedule'|require\('@nestjs\/schedule'\)/.test(source),
      `${file} 引入了 @nestjs/schedule（本项目按需计算，不加定时任务）`,
    );
    assert.ok(!source.includes('@Cron'), `${file} 出现了 @Cron`);
  }
  /*
   * 全仓库范围的收口：@nestjs/schedule 现在在依赖里（条码全量上报要用），
   * 但只允许两处引用它：
   *   · src/collection/** —— 用 SchedulerRegistry 挂那条定时任务（幂等，见其注释）；
   *   · src/app.module.ts —— 组合根，必须在这里 `ScheduleModule.forRoot()`，
   *     否则注册表不存在、任何模块都挂不上任务。
   * 其余模块（尤其通知）必须保持按需计算：它们没有幂等保障，加定时任务就要处理
   * 多实例重复推送。
   */
  const allowedScheduleImporters = /src[/\\](collection[/\\]|app\.module\.ts$)/;
  for (const file of listTs(join(SERVER_ROOT, 'src'))) {
    const source = readFileSync(file, 'utf8');
    if (!/from '@nestjs\/schedule'/.test(source)) continue;
    assert.match(
      file,
      allowedScheduleImporters,
      `@nestjs/schedule 只允许出现在 src/collection/ 与 src/app.module.ts（其余模块必须按需计算）：${file}`,
    );
  }

  assert.match(read('src/app.module.ts'), /NotificationsModule,/, 'NotificationsModule 没有注册进 AppModule');
});

test('提醒的取数：只算未删未遗失且取走时间早于阈值的', () => {
  const service = read('src/notifications/notifications.service.ts');

  assert.match(service, /import \{ alive \} from '\.\.\/common\/soft-delete';/, '必须复用 alive() 过滤软删除');
  assert.match(service, /lostAt: IsNull\(\)/, '已标记遗失的物品/件不该继续提醒');
  assert.match(service, /takenOutAt: LessThanOrEqual\(cutoff\)/, '取走时间必须早于 cutoff 才算超期');
  assert.match(service, /const cutoff = new Date\(Date\.now\(\) - thresholdDays \* DAY_MS\)/, 'cutoff 的计算口径变了');

  // 件级条目要连带检查它所属的物品：物品被软删除/标记遗失时，单独取走的件也不该提醒
  assert.match(service, /row\.item\.deletedAt/, '件级条目没有检查所属物品是否已软删除');
  assert.match(service, /row\.item\.lostAt/, '件级条目没有检查所属物品是否已遗失');

  // 阈值 0 = 关闭：必须用数值比较，写成 !thresholdDays 会让「0」被当成"没设置"
  assert.match(service, /if \(thresholdDays <= 0\)/, '阈值 0 必须显式数值比较（0 是关闭提醒，不是"没设置"）');
  assert.ok(!/if \(!\s*thresholdDays\s*\)/.test(service), '不能用 truthy 判断阈值（0 会被当成未设置）');
  assert.match(service, /enabled: false/, '关闭提醒时要显式回 enabled:false');

  assert.match(service, /b\.days - a\.days/, '超期提醒要按超期天数降序（最久的排最前）');
  assert.match(service, /generatedAt/, '响应要带 generatedAt（前端显示"统计于"）');
});

test('账号资料：头像走 url 映射，且只允许改自己的两项', () => {
  const service = read('src/auth/auth.service.ts');
  const toProfile = methodBody(service, 'private async toProfile(user: User)', 'toProfile');

  assert.match(toProfile, /avatarUrl: mediaUrl\(avatar\)/, '头像要给 mediaUrl 映射后的 url，不能直接吐 storageKey');
  assert.ok(!toProfile.includes('avatarId: user.avatarId,') === false, 'toProfile 要返回 avatarId');
  assert.ok(!toProfile.includes('passwordHash'), '资料里绝不能出现 passwordHash');

  const update = methodBody(service, 'async updateProfile(user: AuthUser, dto: UpdateProfileDto)', 'updateProfile');
  assert.match(update, /In\(familyIds\)/, '头像必须按"用户加入过的家庭"校验，否则能引用别人家的附件');
  assert.match(update, /dto\.avatarId === null/, 'avatarId 传 null 要能清空头像');
  assert.ok(!/dto\.username|dto\.email|dto\.password/.test(update), 'updateProfile 不该能改用户名/邮箱/密码');

  // User.avatarId 没有数据库外键（见 user.entity.ts 注释），所以关系字段不能出现在实体里
  const userEntity = read('src/entities/user.entity.ts');
  assert.ok(!/avatar\s*:\s*Attachment/.test(userEntity), 'User 上不该有 avatar 关系（SQLite 整表重建时 revert 会撞外键）');
});

test('账号资料接口与 DTO：PATCH /auth/me 只认 JWT，阈值有上下界', () => {
  const controller = read('src/auth/auth.controller.ts');
  assert.match(controller, /@Patch\('me'\)/, 'PATCH /auth/me 不见了');
  assert.match(controller, /@UseGuards\(JwtAuthGuard\)\s*\n\s*@Patch\('me'\)/, 'PATCH /auth/me 只该用 JWT（不需要家庭上下文）');

  const dto = read('src/auth/dto/auth.dto.ts');
  assert.match(dto, /class UpdateProfileDto/, 'UpdateProfileDto 不见了');
  const block = dto.slice(dto.indexOf('class UpdateProfileDto'));
  assert.match(block, /@IsInt\(\)/, 'takenOutAlertDays 必须是整数天');
  assert.match(block, /@Min\(0\)/, '阈值下界是 0（0 = 关闭提醒）');
  assert.match(block, /@Max\(365\)/, '阈值要有上界，避免 999999 天这种输入');
});
