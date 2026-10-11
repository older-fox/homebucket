import { InitCollector1792400000000 } from './1792400000000-InitCollector';

/**
 * 迁移清单：显式列出，不用 glob。
 *
 * Nitro 会把服务端代码打包进 .output，`join(__dirname, 'migrations', '*.{js,ts}')`
 * 这种 glob 在打包产物里指不到任何文件（而且会把 .ts 的匹配带进生产）。
 * 显式数组在 dev、tsx 脚本、打包产物三种环境下行为完全一致。
 */
export const migrations = [InitCollector1792400000000];
