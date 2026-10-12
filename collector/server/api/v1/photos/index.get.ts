import { apiHandler } from '../../../utils/http';
import { PhotosService } from '../../../services/photos.service';

/**
 * `GET /api/v1/photos` —— 照片统计（供给面板展示，公开只读）。
 *
 * 只回聚合数字、不回文件名列表：列表接口会被拿来枚举全部照片，
 * 而收集器的照片本就是"随条目公开"的，不该有一个额外的批量出口。
 */
export default defineEventHandler(
  apiHandler(async () => {
    const summary = await new PhotosService().summary();
    return {
      ...summary,
      driverLabel: summary.driver === 's3' ? '对象存储（S3 兼容）' : '本地磁盘',
    };
  }),
);
