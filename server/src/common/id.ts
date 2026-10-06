import { randomBytes } from 'node:crypto';

/** URL 安全的随机 token（邀请链接等） */
export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString('base64url');
}

/** 二维码/条码用的短随机串 */
export function shortToken(bytes = 9): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * 追溯码字符集：去掉容易看错的 I / L / O / U。
 * 长度正好 32，能整除 256，所以下面的取模是无偏的。
 */
const TRACE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * 系统追溯码，形如 `HB-XXXX-XXXX`。
 * 由服务端统一生成，配合 `Item(familyId, traceCode)` 唯一索引保证家庭内唯一；
 * 物品创建后不可修改（更新接口不接受该字段）。
 */
export function traceCode(): string {
  const chars = Array.from(randomBytes(8), (byte) => TRACE_ALPHABET[byte % TRACE_ALPHABET.length]);
  return `HB-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}
