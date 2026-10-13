import type { AuthUser } from './useAuth';

/** GET /api/setup/status 的形状（与后端 SetupProbeController / SetupStatusController 对应） */
export interface SetupStatus {
  needsSetup: boolean;
  databaseAvailable: boolean;
  database: {
    provider: 'mysql' | 'sqlite';
    source: 'file' | 'env' | 'default';
    host?: string;
    port?: number;
    username?: string;
    database?: string;
    filePath?: string;
    /** 只回"有没有密码"，不回值 */
    hasPassword?: boolean;
    /** 容器内数据位置被钉死（= /data），此时 SQLite 路径不可改 */
    lockedStorage?: boolean;
  };
}

/** 引导第 1 步的表单（mysql 与 sqlite 各用一部分字段） */
export interface DatabaseForm {
  provider: 'mysql' | 'sqlite';
  url?: string;
  host?: string;
  port?: number | '';
  username?: string;
  password?: string;
  database?: string;
  filePath?: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 首启引导的接口封装。
 *
 * 只覆盖引导**自己**的四个动作：看状态、试连接、保存连接、建第一个账号、收尾。
 * 第 3/4 步那些配置项不在这里 —— 它们直接复用 `useInstanceSettings`（同一套
 * `/api/admin/settings`、同一份草稿与保存逻辑），没必要再写一遍。
 */
export function useSetup() {
  const api = useApi();
  const { t } = useI18n();

  function messageOf(error: unknown): string {
    return (error as { message?: string })?.message ?? t('errors.unknown');
  }

  async function status(): Promise<SetupStatus> {
    return api.get<SetupStatus>('/setup/status');
  }

  async function testDatabase(form: DatabaseForm): Promise<void> {
    await api.post('/setup/database/test', form);
  }

  /**
   * 保存连接参数。后端写完 `/data/db.config.json` 会**退出**并由 entrypoint 重启，
   * 所以这里接着轮询状态，等它按新配置回来再继续 —— 否则引导页会看到一次
   * "接口挂了"，用户以为自己把实例搞坏了。
   */
  async function saveDatabase(form: DatabaseForm): Promise<boolean> {
    await api.post('/setup/database', form);
    return waitForRestart();
  }

  /** 等后端重启回来（最多 ~40 秒） */
  async function waitForRestart(attempts = 40, intervalMs = 1000): Promise<boolean> {
    for (let index = 0; index < attempts; index += 1) {
      await sleep(intervalMs);
      try {
        await status();
        return true;
      } catch {
        // 还在重启（502 / 连接被拒），继续等
      }
    }
    return false;
  }

  /**
   * 建第一个账号（实例管理员）并直接登录。
   *
   * 刻意**不**走 `useAuth().acceptSession()`：那会顺手拉一次家庭列表，而引导期间
   * `/api/families` 被服务端门禁挡着（503 setup.required）。这里只把 token 与用户写进
   * 会话状态就够了，家庭列表等引导完成后由正常导航去拉。
   */
  async function createAdmin(payload: { username: string; password: string; email?: string }): Promise<AuthUser> {
    const result = await api.post<{ accessToken: string; user: AuthUser }>('/setup/admin', payload);
    api.token.value = result.accessToken;
    const { user } = useAuth();
    user.value = result.user;
    return result.user;
  }

  async function finish(): Promise<void> {
    await api.post('/setup/finish');
  }

  return { status, testDatabase, saveDatabase, waitForRestart, createAdmin, finish, messageOf };
}
