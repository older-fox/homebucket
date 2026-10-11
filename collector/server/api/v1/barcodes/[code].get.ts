import { apiHandler } from '../../../utils/http';
import { CompatService } from '../../../services/compat.service';

/**
 * `GET /api/v1/barcodes/:code` —— **老契约**（已部署的 HomeBucket 实例在调它）。
 *
 * 没有身份校验：老实例端只发这一条请求，硬加凭据等于把它们全部挡在门外。
 * 收录返回 200，未收录返回 404 `item.notFound` —— 实例据此决定"没查到就不自动填充"。
 * 响应里的 barcode 回显请求写法（不归一化），老客户端会拿它跟自己的扫码结果比对。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    const code = getRouterParam(event, 'code') ?? '';
    return new CompatService().lookup(code);
  }),
);
