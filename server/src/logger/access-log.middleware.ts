import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { nginxTime } from './app.logger';

/**
 * nginx combined 风格访问日志：
 * $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"
 */
@Injectable()
export class AccessLogMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();
    const remoteAddr = req.ip ?? req.socket?.remoteAddress ?? '-';

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const bytes = Number(res.getHeader('content-length') ?? 0) || 0;
      const line = [
        remoteAddr,
        '-',
        '-',
        `[${nginxTime()}]`,
        `"${req.method} ${req.originalUrl} ${req.httpVersion ? `HTTP/${req.httpVersion}` : 'HTTP/1.1'}"`,
        String(res.statusCode),
        String(bytes),
        `"${req.headers.referer ?? '-'}"`,
        `"${req.headers['user-agent'] ?? '-'}"`,
        `rt=${ms.toFixed(3)}`,
      ].join(' ');

      process.stdout.write(`${line}\n`);
    });

    next();
  }
}
