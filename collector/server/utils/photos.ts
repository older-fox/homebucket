import { MAX_IMAGE_URLS } from './identity';

/**
 * "还缺不缺照片"这件事的口径。
 *
 * 收集器的图片语义是**累加**的（照片只有"多"没有"错"，见 utils/identity.ts 的合并规则），
 * 所以"要不要图"这个问题等价于"现在一张都没有吗"。把判断收在这里，是为了让
 * 上报接口（`POST /api/v1/contributions`）与查询接口（`GET /api/v1/items/:barcode`、
 * 老契约 `barcodes/:code`）给出同一个答案 —— 两边各判一次迟早会分叉。
 */
export interface PhotoIntent {
  /** 该条目当前已有多少张图 */
  imageCount: number;
  /** 收集器是否希望上传方再补图 */
  wantsPhotos: boolean;
  /** 单条目图片上限，供上报方自己先截断，别传上来才被丢 */
  maxImages: number;
  /** 本站当前是否接受照片上传（留一个总闸的位置） */
  uploadEnabled: boolean;
}

/**
 * 本站是否收照片。
 *
 * 今天恒为 true；单独拎出来是因为"拒收照片"会是一个运维动作（磁盘/合规），
 * 到时候改这一处就够了，响应契约（wantsPhotos 恒为 false）不用动。
 */
const UPLOAD_ENABLED = true;

export function photoIntentOf(imageUrls: readonly string[]): PhotoIntent {
  const imageCount = imageUrls.length;
  return {
    imageCount,
    wantsPhotos: imageCount === 0 && UPLOAD_ENABLED,
    maxImages: MAX_IMAGE_URLS,
    uploadEnabled: UPLOAD_ENABLED,
  };
}
