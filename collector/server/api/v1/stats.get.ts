import { apiHandler } from '../../utils/http';
import { StatsService } from '../../services/stats.service';

/** `GET /api/v1/stats` —— 公共资料库的整体概览（首页与实例端"看进展"都用它） */
export default defineEventHandler(
  apiHandler(async () => {
    return new StatsService().overview();
  }),
);
