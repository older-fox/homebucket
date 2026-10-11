import { env } from '../../server/utils/env';
import { getDataSource } from '../../server/database/db';
import { CatalogItem, CollectorInstance, Contribution } from '../../server/database/entities';

const STARTED_AT = Date.now();

/**
 * 健康检查：既要能当 docker/k8s 探针（快、只读），也要在运维登录不进去时
 * 用一条 curl 说清"这个实例是谁、什么版本、注册开关、库里有多少东西"。
 */
export default apiHandler(async () => {
  const dataSource = getDataSource();
  return {
    status: 'ok',
    service: 'homebucket-collector',
    version: env.version,
    nodeEnv: env.nodeEnv,
    uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
    registrationOpen: env.registrationOpen,
    storage: {
      provider: env.dbProvider,
      dataFile: env.dataFile,
      items: await dataSource.getRepository(CatalogItem).count(),
      contributions: await dataSource.getRepository(Contribution).count(),
      instances: await dataSource.getRepository(CollectorInstance).count(),
    },
  };
});
