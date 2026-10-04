import { Injectable, LoggerService, LogLevel } from '@nestjs/common';
import { env, type LogFormat } from '../config/env';

const COLOR: Record<string, string> = {
  fatal: '\x1b[35m',
  error: '\x1b[31m',
  warn: '\x1b[33m',
  log: '\x1b[32m',
  debug: '\x1b[36m',
  verbose: '\x1b[90m',
};
const RESET = '\x1b[0m';
const DIM = '\x1b[90m';
const BOLD = '\x1b[1m';

/** nginx error_log 使用的级别名 */
const NGINX_LEVEL: Record<string, string> = {
  fatal: 'crit',
  error: 'error',
  warn: 'warn',
  log: 'info',
  debug: 'debug',
  verbose: 'notice',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 04/Oct/2026:15:04:05 +0800 */
export function nginxTime(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
  return `${pad(d.getDate())}/${MONTHS[d.getMonth()]}/${d.getFullYear()}:${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())} ${offset}`;
}

function stringify(message: unknown): string {
  if (message instanceof Error) return `${message.message}${message.stack ? `\n${message.stack}` : ''}`;
  if (typeof message === 'string') return message;
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

/**
 * 应用日志：pretty（彩色）/ json（单行 JSON）/ nginx（nginx error_log 风格）
 * 访问日志由 AccessLogMiddleware 单独输出（nginx combined 风格）
 */
@Injectable()
export class AppLogger implements LoggerService {
  private levels: LogLevel[] = env.logLevels;
  private format: LogFormat = env.logFormat;

  setLogLevels(levels: LogLevel[]) {
    this.levels = levels;
  }

  setLogFormat(format: LogFormat) {
    this.format = format;
  }

  log(message: unknown, ...params: unknown[]) {
    this.write('log', message, params);
  }

  error(message: unknown, ...params: unknown[]) {
    this.write('error', message, params);
  }

  warn(message: unknown, ...params: unknown[]) {
    this.write('warn', message, params);
  }

  debug(message: unknown, ...params: unknown[]) {
    this.write('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]) {
    this.write('verbose', message, params);
  }

  fatal(message: unknown, ...params: unknown[]) {
    this.write('fatal', message, params);
  }

  private write(level: LogLevel | 'fatal', message: unknown, params: unknown[]) {
    if (!this.levels.includes(level === 'fatal' ? 'error' : level)) return;

    // Nest 约定：最后一个字符串参数是上下文
    const last = params[params.length - 1];
    const context = typeof last === 'string' ? last : undefined;
    const text = stringify(message);
    const line =
      this.format === 'json'
        ? this.toJson(level, text, context)
        : this.format === 'nginx'
          ? this.toNginx(level, text, context)
          : this.toPretty(level, text, context);

    process.stdout.write(`${line}\n`);
  }

  private toPretty(level: string, text: string, context?: string) {
    const color = COLOR[level] ?? '';
    const tag = level.toUpperCase().padEnd(7);
    const ctx = context ? ` ${DIM}[${context}]${RESET}` : '';
    return `${DIM}${new Date().toISOString()}${RESET} ${BOLD}${color}${tag}${RESET}${ctx} ${text}`;
  }

  private toJson(level: string, text: string, context?: string) {
    return JSON.stringify({
      ts: new Date().toISOString(),
      level,
      pid: process.pid,
      context: context ?? null,
      message: text,
    });
  }

  private toNginx(level: string, text: string, context?: string) {
    const ctx = context ? `, context: "${context}"` : '';
    return `${nginxTime()} [${NGINX_LEVEL[level] ?? 'info'}] ${process.pid}#0: *${process.hrtime.bigint() % 1000n} ${text}${ctx}`;
  }
}
