import { LENGTH } from '../database/column-spec';
import { MIN_ADMIN_PASSWORD_LENGTH } from '../utils/env';
import { Validation } from './validation';

/**
 * 管理端登录 / 改密的 body。
 *
 * 口令这里**不做 trim、不改大小写、不查复杂度**：
 *  · trim 会把"我明明配了同一个密码却登不上"变成一次无从下手的排查；
 *  · 复杂度规则（必须有大写+符号…）对单人运维的纠错台只是负担，
 *    真正有用的是长度下限（见 MIN_ADMIN_PASSWORD_LENGTH）与"不要和旧密码相同"。
 * 长度上限只是输入卫生：scrypt 的成本与口令长度无关，这里不给无限长的输入留口子。
 */
const PASSWORD_MAX = 1024;

export interface LoginDto {
  username: string;
  password: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export function parseLogin(raw: Record<string, unknown>): LoginDto {
  const v = new Validation();
  v.requiredString('username', raw.username, 1, LENGTH.adminUsername);
  v.requiredString('password', raw.password, 1, PASSWORD_MAX);
  v.check();
  return {
    username: (raw.username as string).trim(),
    password: raw.password as string,
  };
}

export function parseChangePassword(raw: Record<string, unknown>): ChangePasswordDto {
  const v = new Validation();
  v.requiredString('currentPassword', raw.currentPassword, 1, PASSWORD_MAX);
  v.requiredString('newPassword', raw.newPassword, MIN_ADMIN_PASSWORD_LENGTH, PASSWORD_MAX);
  v.check();
  return {
    currentPassword: raw.currentPassword as string,
    newPassword: raw.newPassword as string,
  };
}
