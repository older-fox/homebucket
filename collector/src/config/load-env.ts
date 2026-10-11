import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

/**
 * 读取 collector/.env（这个项目自己的配置）。
 *
 * 收集器是**独立项目**：可能被单独部署（另一个目录、另一台机器、另一份镜像），
 * 所以它只认自己工作目录下的 .env，不去读仓库根目录的 .env、也不读 HomeBucket 主服务的配置。
 * 这条规则让"把 collector 目录整个拷走就能独立运行"成立。
 *
 * 必须在 import env 之前执行：env 模块在加载时就把 process.env 读成了一组常量。
 * dotenv 不覆盖已存在的环境变量，因此命令行 / 容器注入的值优先级更高。
 */
loadEnv({ path: resolve(process.cwd(), '.env') });
