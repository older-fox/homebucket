import { InitCollector1792400000000 } from './1792400000000-InitCollector';
import { AdminAuth1792500000000 } from './1792500000000-AdminAuth';
import { ObservationsPhotosSync1792600000000 } from './1792600000000-ObservationsPhotosSync';
import { SourceIdentity1792700000000 } from './1792700000000-SourceIdentity';
import { ObservationUserAgent1792800000000 } from './1792800000000-ObservationUserAgent';
import { ContributionDedupe1792900000000 } from './1792900000000-ContributionDedupe';

/**
 * 迁移清单：显式列出，不用 glob。
 *
 * Nitro 会把服务端代码打包进 .output，`join(__dirname, 'migrations', '*.{js,ts}')`
 * 这种 glob 在打包产物里指不到任何文件（而且会把 .ts 的匹配带进生产）。
 * 显式数组在 dev、tsx 脚本、打包产物三种环境下行为完全一致。
 */
export const migrations = [
  InitCollector1792400000000,
  AdminAuth1792500000000,
  ObservationsPhotosSync1792600000000,
  SourceIdentity1792700000000,
  ObservationUserAgent1792800000000,
  ContributionDedupe1792900000000,
];
