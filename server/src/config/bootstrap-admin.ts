import type { LoggerService } from '@nestjs/common';
import { hash } from 'bcryptjs';
import type { DataSource } from 'typeorm';
import { User } from '../entities/user.entity';
import type { FamiliesService } from '../families/families.service';
import { env } from './env';

/**
 * 空库首次启动时按配置创建管理员，让实例开箱可用。
 * 只在「一个用户都没有」时触发；DEFAULT_ADMIN_* 未配置时回退 admin/admin admin@example.com。
 *
 * 这里直接拿 DataSource（而不是某个 Repository）：需要在同一个事务里
 * 建用户 + 建个人家庭，用 manager 串起来更直白。
 */
export async function bootstrapAdmin(
  dataSource: DataSource,
  families: FamiliesService,
  logger: LoggerService,
): Promise<void> {
  if (!env.autoCreateAdmin) return;

  const users = await dataSource.getRepository(User).count();
  if (users > 0) return;

  const email = env.defaultAdminEmail.toLowerCase();
  const user = await dataSource.getRepository(User).save(
    dataSource.getRepository(User).create({
      email,
      username: env.defaultAdminUsername,
      passwordHash: await hash(env.defaultAdminPassword, 10),
      locale: env.defaultLocale,
      defaultFamilyId: null,
    }),
  );

  await families.ensurePersonalFamily(user.id, user.username);

  logger.log(
    `空库初始化：已创建默认管理员 ${user.username} <${email}>，请登录后尽快修改密码（配置项 DEFAULT_ADMIN_*）`,
    'Bootstrap',
  );
}
