// 由 prisma/src/models.prisma（唯一来源）生成 mysql / sqlite 两份 schema。
// 模型只维护一份，避免双 provider 手工同步导致漂移。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const models = readFileSync(resolve(root, 'prisma/src/models.prisma'), 'utf8').trim();
const banner =
  '// ⚠️ 自动生成，请勿手动编辑。\n' +
  '// 模型定义见 prisma/src/models.prisma，改完执行 npm run prisma:build\n\n';

const targets = {
  mysql: `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
  // shadowDatabaseUrl = env("SHADOW_DATABASE_URL") // migrate dev 需要影子库
}

`,
  sqlite: `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DB_FILE_PATH")
}

`,
};

for (const [provider, header] of Object.entries(targets)) {
  const file = resolve(root, `prisma/${provider}/schema.prisma`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${banner}${header}${models}\n`);
  console.log(`[prisma:build] 生成 prisma/${provider}/schema.prisma`);
}
