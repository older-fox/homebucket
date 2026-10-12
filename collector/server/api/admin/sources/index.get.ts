import { apiHandler } from '../../../utils/http';
import { requireAdminSession } from '../../../services/auth.service';
import { SourcesService } from '../../../services/sources.service';
import { parseQueryAdminSources } from '../../../dto/admin';

/**
 * `GET /api/admin/sources` —— 上报来源一览（按权重升序，可疑的排前面）。
 *
 * 上报全是匿名的，所以"来源"不是 CollectorInstance，而是由请求推导出的来源键。
 * 管理端需要它是为了三件事：找出正在刷错数据的来源、看某来源被评过多少次、
 * 以及核对某个 `r:…`/`f:…` 到底是谁（页面上给出展示名与 UA）。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    await requireAdminSession(event);
    const query = parseQueryAdminSources(getQuery(event) as Record<string, unknown>);
    return new SourcesService().list(query);
  }),
);
