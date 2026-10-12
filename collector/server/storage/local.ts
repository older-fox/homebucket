import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import type { PhotoStorage } from './types';

/**
 * 本地磁盘驱动：照片就放在收集器进程能访问的一个目录里。
 *
 * 适合自建/单机部署 —— 不需要额外的对象存储，`data/` 目录跟数据库一起备份即可。
 * 代价是**不能多副本**：两个收集器进程各写各的磁盘、互相看不到对方的图，
 * 这时应该切到 S3 驱动（同一 bucket 天然共享）。
 */
export class LocalPhotoStorage implements PhotoStorage {
  readonly driver = 'local' as const;

  constructor(
    private readonly root: string,
    /** 对外基地址；为空时返回本站相对路径（由 `/api/photos/[...path]` 提供图） */
    private readonly publicBase: string | null,
  ) {}

  /**
   * 写入。用 `wx`（独占创建）而不是 `w`：
   * 内容寻址下同名文件内容必然相同，重复写没有意义；用 `wx` 还能顺手
   * 挡住"两个请求同时上传同一张图"时的相互覆盖 —— EEXIST 直接当成功。
   */
  async put(input: { hash: string; ext: string; mime: string; bytes: Buffer; storageKey: string }): Promise<string> {
    const target = this.absolutePath(input.storageKey);
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(target, input.bytes, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // 已经存过同一份内容：当作成功（幂等），不覆盖
    }
    return input.storageKey;
  }

  /** 读回；文件不存在返回 null（而不是抛错让上层 500） */
  async get(storageKey: string): Promise<Buffer | null> {
    try {
      return await readFile(this.absolutePath(storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  /** 幂等删除：`force: true` 让"本来就不存在"也不报错 */
  async delete(storageKey: string): Promise<void> {
    await rm(this.absolutePath(storageKey), { force: true });
  }

  urlFor(storageKey: string): string {
    const path = `/api/photos/${storageKey}`;
    if (this.publicBase === null || this.publicBase === '') return path;
    return `${this.publicBase.replace(/\/+$/, '')}${path}`;
  }

  /**
   * 键 → 绝对路径，并**确认结果仍落在 root 之内**。
   *
   * storageKey 来自数据库，正常情况下是 `ab/cdef/<hash>.png`；但只要有任何一条
   * 路径能带着 `../` 进到数据库（比如未来某个导入脚本），这里就会变成
   * 任意文件读/写/删。多做一次前缀校验的代价可以忽略。
   */
  private absolutePath(storageKey: string): string {
    const root = resolve(this.root);
    const target = resolve(join(root, normalize(storageKey)));
    if (target !== root && !target.startsWith(root + sep)) {
      throw new Error(`照片路径越界：${storageKey}`);
    }
    return target;
  }
}
