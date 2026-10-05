import type { LoggerService } from '@nestjs/common';
import { hash } from 'bcryptjs';
import type { PrismaService } from '../prisma/prisma.service';
import type { FamiliesService } from '../families/families.service';
import { env } from './env';

/**
 * 空库首次启动时按配置创建管理员，让实例开箱可用。
 * 只在「一个用户都没有」时触发；DEFAULT_ADMIN_* 未配置时回退 admin/admin admin@example.com。
 */
export async function bootstrapAdmin(
  prisma: PrismaService,
  families: FamiliesService,
  logger: LoggerService,
): Promise<void> {
  if (!env.autoCreateAdmin) return;

  const users = await prisma.user.count();
  if (users > 0) return;

  const email = env.defaultAdminEmail.toLowerCase();
  const user = await prisma.user.create({
    data: {
      email,
      username: env.defaultAdminUsername,
      passwordHash: await hash(env.defaultAdminPassword, 10),
      locale: env.defaultLocale,
    },
    select: { id: true, username: true },
  });

  await families.ensurePersonalFamily(user.id, user.username);

  logger.log(
    `空库初始化：已创建默认管理员 ${user.username} <${email}>，请登录后尽快修改密码（配置项 DEFAULT_ADMIN_*）`,
    'Bootstrap',
  );
}
