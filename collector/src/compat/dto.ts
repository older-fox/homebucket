import { IsOptional, IsString, MaxLength } from 'class-validator';
import { FIELD_LIMITS } from '../common/identity';

/**
 * HomeBucket 实例**既有客户端**的上报体（见主仓库 README「Barcode data collection」一节）：
 *
 *   POST {DATA_COLLECTION_ENDPOINT}/observations
 *   { "barcode": "...", "name": "...", "manufacturer": "...", "model": "...",
 *     "category": "...", "clientVersion": "homebucket/1" }
 *
 * 这个 DTO 存在的原因只有一个：**互操作**。已经部署出去的实例不会因为我们换协议而升级，
 * 所以收集器必须在自己的 v1 协议之外，原样吃下这份老契约（字段更少、且不带任何身份）。
 * 字段刻意与 `CreateContributionDto` 同名同义，避免再维护一张映射表；
 * `description`/`baseUnit`/`imageUrls`/`attributes` 老客户端不发，就不在这里声明。
 */
export class ObservationCompatDto {
  @IsString()
  @MaxLength(64)
  barcode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.name)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.manufacturer)
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.model)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.category)
  category?: string;

  /** 老客户端固定发 `homebucket/1`；收集器只把它当作"来源版本"记录，不参与裁决 */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  clientVersion?: string;
}
