import { randomBytes } from 'node:crypto';

/** URL 安全的随机 token（邀请链接等） */
export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString('base64url');
}

/** 二维码/条码用的短随机串 */
export function shortToken(bytes = 9): string {
  return randomBytes(bytes).toString('hex');
}
