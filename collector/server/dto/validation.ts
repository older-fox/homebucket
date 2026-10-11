import { badRequest, type FieldError } from '../utils/http';

/**
 * 手写校验，顶替迁移前的 class-validator / class-transformer。
 *
 * ── 为什么不继续用 class-validator ──
 * 它依赖 `emitDecoratorMetadata`（编译期发出的 `design:type`），而 Nitro 用 esbuild
 * 打包服务端代码，esbuild **不支持**发这个元数据（数据库实体因此也从装饰器改成
 * EntitySchema，见 database/entities.ts，同一原因）。所以校验改成显式的函数调用：
 * 一样的边界（长度、类型、可空性），只是不再靠反射。
 *
 * ── 错误信封 ──
 * 迁移前 ValidationPipe 的 exceptionFactory 产出
 *   `{ statusCode:400, code:'validation.failed', message, fields }`，
 * 其中 `fields` 是 `{ 字段名: [消息…] }`。收集器里把 fields 统一成
 * `{ field, message }[]`（FieldError，见 utils/http.ts），因为前端/审计页是**按数组
 * 遍历**渲染的，数组不需要 Object.entries，也不会因为字段名带 `.`（attributes.电压）而被拆错。
 * message 仍是"第一个字段 + 它的第一条消息"，与迁移前逐字一致。
 *
 * ── 可选值：null 与 undefined 同等对待 ──
 * 迁移前的 `@IsOptional()` 是"值为 null 或 undefined 就整段跳过校验"，
 * 而 `{name:null}` 这种 body 在业务层同样被当作"没提供"（patchItem 只认 `typeof === 'string'`）。
 * 所以本文件所有 optional* 访问器都在 null 上早退 —— 否则 `PATCH /api/admin/items/:id {"name":null}`
 * 会从"没改 name"变成 400 validation.failed，属于行为回归。
 */

/** 逐字段收集校验错误，最后一次性抛出（与 class-validator 的"收集全部错误"一致） */
export class Validation {
  private readonly errors: FieldError[] = [];

  /** 可选字符串：未提供（undefined / null）就跳过；其余非法值一律报错 */
  optionalString(field: string, value: unknown, maxLength: number): this {
    if (value === undefined || value === null) return this;
    this.string(field, value);
    this.maxLength(field, value, maxLength);
    return this;
  }

  /** 必填字符串 + 长度区间（RegisterInstanceDto.name 用 Length(1,120)） */
  requiredString(field: string, value: unknown, minLength: number, maxLength: number): this {
    this.string(field, value);
    if (typeof value === 'string') {
      if (value.length < minLength) {
        this.push(field, `${field} must be longer than or equal to ${minLength} characters`);
      }
      if (value.length > maxLength) {
        this.push(field, `${field} must be shorter than or equal to ${maxLength} characters`);
      }
    }
    return this;
  }

  /** 字符串 + 最大长度（迁移前 @IsString() + @MaxLength(n)） */
  string(field: string, value: unknown, maxLength?: number): this {
    if (typeof value !== 'string') {
      this.push(field, `${field} must be a string`);
      return this;
    }
    if (maxLength !== undefined) this.maxLength(field, value, maxLength);
    return this;
  }

  private maxLength(field: string, value: unknown, maxLength: number): void {
    if (typeof value === 'string' && value.length > maxLength) {
      this.push(field, `${field} must be shorter than or equal to ${maxLength} characters`);
    }
  }

  /** 可选整数：先做 ToNum 语义的转换，再当数字校验（可空） */
  optionalInt(field: string, value: unknown, min?: number): PagingValue {
    if (value === undefined || value === null) return { provided: false, value: undefined };
    const converted = toNumberInput(value);
    if (converted === undefined) {
      // 空串/空数组按"没传"处理，与迁移前的 @ToNum 一致
      return { provided: false, value: undefined };
    }
    this.intValue(field, converted, min);
    return { provided: true, value: typeof converted === 'number' ? converted : undefined };
  }

  /** 必填整数（MergeItemDto.sourceItemId，@IsInt 但没有 @Min） */
  requiredInt(field: string, value: unknown, min?: number): number | undefined {
    if (value === undefined) {
      this.push(field, `${field} must be an integer number`);
      return undefined;
    }
    const converted = toNumberInput(value);
    if (converted === undefined) {
      this.push(field, `${field} must be an integer number`);
      return undefined;
    }
    this.intValue(field, converted, min);
    return typeof converted === 'number' ? converted : undefined;
  }

  private intValue(field: string, converted: number | string, min?: number): void {
    if (typeof converted !== 'number' || !Number.isFinite(converted)) {
      this.push(field, `${field} must be an integer number`);
      return;
    }
    if (!Number.isInteger(converted)) {
      this.push(field, `${field} must be an integer number`);
      return;
    }
    if (min !== undefined && converted < min) {
      this.push(field, `${field} must not be less than ${min}`);
    }
  }

  /**
   * 可选布尔（QueryAdminContributionsDto.blocked）。
   * 迁移前这里是 `@ToBool() @IsBoolean()`：ToBool 把 'true'/'1'/'yes' 变 true、
   * 其余非空值变 **false**（'' / null 变 undefined），所以查询串 `blocked=maybe`
   * 是"合法但为 false"，不会 400 —— 逐字照搬，否则纠错台的筛选会突然报错。
   */
  optionalBoolean(field: string, value: unknown): boolean | undefined {
    const converted = toBoolean(value);
    if (converted === undefined) {
      // 与 ToBool 一致：非空且不是布尔的输入会被转成 false，而不是被拒绝
      if (value === undefined || value === null || value === '') return undefined;
      return false;
    }
    if (typeof converted !== 'boolean') {
      this.push(field, `${field} must be a boolean value`);
      return undefined;
    }
    return converted;
  }

  /** 必填布尔（BlockContributionDto.blocked）：**没有** ToBool 转换，字符串 'true' 不合法 */
  requiredBoolean(field: string, value: unknown): boolean | undefined {
    if (typeof value !== 'boolean') {
      this.push(field, `${field} must be a boolean value`);
      return undefined;
    }
    return value;
  }

  /** 可选字符串数组：@IsArray + 每项 @IsString + @MaxLength（imageUrls 等） */
  optionalStringArray(
    field: string,
    value: unknown,
    options: { maxItems: number; maxItemLength?: number },
  ): this {
    if (value === undefined || value === null) return this;
    if (!Array.isArray(value)) {
      this.push(field, `${field} must be an array`);
      return this;
    }
    if (value.length > options.maxItems) {
      this.push(field, `${field} must contain no more than ${options.maxItems} elements`);
    }
    for (const item of value) {
      if (typeof item !== 'string') {
        this.push(field, `each value in ${field} must be a string`);
        break;
      }
    }
    if (options.maxItemLength === undefined) return this;
    for (const item of value) {
      if (typeof item === 'string' && item.length > options.maxItemLength) {
        this.push(
          field,
          `each value in ${field} must be shorter than or equal to ${options.maxItemLength} characters`,
        );
        break;
      }
    }
    return this;
  }

  /** 可选对象（@IsObject）：数组、字符串、数字都不是对象 */
  optionalObject(field: string, value: unknown): this {
    if (value === undefined || value === null) return this;
    if (typeof value !== 'object' || Array.isArray(value)) {
      this.push(field, `${field} must be an object`);
    }
    return this;
  }

  /**
   * 可选"字符串记录"（attributes）：必须是对象，且值统一按字符串处理
   * —— 迁移前 DTO 只校验 `@IsObject()`，值的字符串化发生在 normalizeFields/parseAttributes。
   */
  optionalRecord(field: string, value: unknown): Record<string, unknown> | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'object' || Array.isArray(value)) {
      this.push(field, `${field} must be an object`);
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  private push(field: string, message: string): void {
    this.errors.push({ field, message });
  }

  /** 有错则抛 400 validation.failed；message 取第一个字段的第一条消息 */
  check(): void {
    if (this.errors.length === 0) return;
    const first = this.errors[0];
    throw badRequest(
      'validation.failed',
      first === undefined ? '请求参数校验失败' : `${first.field}: ${first.message}`,
      this.errors,
    );
  }
}

export interface PagingValue {
  provided: boolean;
  value: number | undefined;
}

/**
 * `@Type(() => Number)` / `@ToNum()` 的等价物。
 *
 * 返回 undefined 表示"按未提供处理"（空串、空数组）；返回字符串表示"读不懂"，
 * 交给 IsInt 报错；返回数字则继续做 IsInt/Min 检查。
 * NaN/Infinity 也归入"读不懂"——`Number(true)` 是 1（合法），但 `Number({})` 是 NaN。
 */
export function toNumberInput(value: unknown): number | string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 'NaN';
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    return 'NaN';
  }
  return 'NaN';
}

/** `@ToBool()` 的等价物：只认 'true'/'1'/'yes'，其余非空值是 false，空值是 undefined */
export function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const text = String(value).toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}

/**
 * 路径参数里的整数（迁移前的 ParseIntPipe）。
 * 非整数字符串 → 400 validation.failed，文案与 Nest 的 ParseIntPipe 逐字一致，
 * 便于照旧断言/排查。
 */
export function pathInt(field: string, raw: string | undefined): number {
  const text = (raw ?? '').trim();
  if (!/^-?\d+$/.test(text)) {
    throw badRequest('validation.failed', 'Validation failed (numeric string is expected)', [
      { field, message: 'Validation failed (numeric string is expected)' },
    ]);
  }
  return Number.parseInt(text, 10);
}
