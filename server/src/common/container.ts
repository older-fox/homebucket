import { existsSync, readFileSync } from 'node:fs';

/**
 * 容器内被**钉死**的存储位置。
 *
 * 为什么是写死的常量而不是可配置项：这些值一旦被改错，后果是"数据写到容器临时层、
 * 容器一重建就全没了"，而且用户很难意识到。发布镜像的 `/data` 是唯一挂卷点，
 * 所以没有第二种正确答案。`STORAGE_DRIVER`/`S3_*` 不在此列 —— 那是"存储后端"，
 * 与"本地存储目录"是两件事，用 S3 的部署照样要能改。
 */
export const CONTAINER_DATA_DIR = '/data';
export const CONTAINER_UPLOAD_DIR = '/data/uploads';
export const CONTAINER_DB_FILE = '/data/homebucket.db';

/** 锁定集：环境变量名 → 强制值 */
export const LOCKED_CONTAINER_VALUES: Readonly<Record<string, string>> = {
  DATA_DIR: CONTAINER_DATA_DIR,
  UPLOAD_DIR: CONTAINER_UPLOAD_DIR,
  DB_FILE_PATH: CONTAINER_DB_FILE,
};

/** 根文件系统是不是 overlay/aufs（容器典型特征） */
function rootFilesystemIsOverlay(): boolean {
  try {
    for (const line of readFileSync('/proc/self/mountinfo', 'utf8').split('\n')) {
      // 一行形如：36 1 0:32 / / rw,relatime - overlay overlay rw,...
      // 第 5 个字段是挂载点，` - ` 之后第一个字段是文件系统类型
      const [meta, tail] = line.split(' - ');
      if (!tail) continue;
      if (meta.split(' ')[4] !== '/') continue;
      const fsType = tail.split(' ')[0];
      return fsType === 'overlay' || fsType === 'aufs';
    }
  } catch {
    // 读不到就当不是 —— 判错的方向是"少锁一层"，比误锁住开发机安全
  }
  return false;
}

let cached: boolean | null = null;

/**
 * 是否运行在容器里。
 *
 * 多信号判断：不同运行时留下的痕迹不一样 ——
 *   · Docker 会建 `/.dockerenv`
 *   · Podman / LXC 设 `container=` 环境变量
 *   · k8s(containerd) 只在 cgroup 里留痕
 *   · 兜底看根文件系统是不是 overlay/aufs
 */
export function isContainerized(): boolean {
  if (cached !== null) return cached;

  cached = (() => {
    try {
      if (existsSync('/.dockerenv')) return true;

      if (process.env.container === 'podman' || process.env.container === 'docker' || process.env.container === 'lxc') {
        return true;
      }

      try {
        if (/docker|kubepods|containerd|lxc/.test(readFileSync('/proc/self/cgroup', 'utf8'))) return true;
      } catch {
        // /proc 不可读（非 Linux）→ 继续看别的信号
      }

      return rootFilesystemIsOverlay();
    } catch {
      return false;
    }
  })();

  return cached;
}

/**
 * 是否进入"锁定模式"：**容器 且 生产环境**。
 *
 * 为什么必须带 `NODE_ENV=production`：不加这一条，开发机、CI、各种 devcontainer
 * 也会被强制 `/data`、并把"数据目录/上传目录"两个字段从设置页里藏掉 ——
 * 而那些场景恰恰需要能改数据目录。发布镜像自带 `ENV NODE_ENV=production`（Dockerfile），
 * 所以线上一定命中，本地 `npm run dev` 不受影响。
 * **不要**把这条当成 bug 改掉。
 */
export function isLockedDown(): boolean {
  return isContainerized() && (process.env.NODE_ENV ?? 'development') === 'production';
}

/**
 * 锁定生效时，如果发现有人显式把 SQLite 库文件指到了别处，提示一声。
 *
 * 这里**只告警、不拒绝启动**：现有自部署可能就是用 `-e DB_FILE_PATH=/somewhere/else`
 * 跑的，直接拒启会把人锁在门外；但也不能悄悄改用它 —— 那会让运维以为在用自己的老库，
 * 实际写进了一个新空库。所以按"钉死 + 说清实际用的是哪个文件"处理。
 */
export function warnOnLockedConflicts(): void {
  const explicitDbFile = process.env.DB_FILE_PATH?.trim();
  if (explicitDbFile && explicitDbFile !== CONTAINER_DB_FILE) {
    console.warn(
      `[container] 已忽略 DB_FILE_PATH=${explicitDbFile}：容器内 SQLite 库文件固定为 ${CONTAINER_DB_FILE}；` +
        `数据目录固定为 ${CONTAINER_DATA_DIR}（镜像里唯一挂卷点）。` +
        '要改数据位置请改挂卷，不要改这些变量。',
    );
  }
}
