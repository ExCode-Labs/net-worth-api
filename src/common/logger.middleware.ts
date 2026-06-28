import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

/**
 * Logs every HTTP request once the response finishes:
 *   METHOD /path 200 12ms - 1.2kb - 49.36.x.x
 * 4xx are logged at warn, 5xx at error, everything else at log level.
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();
    const { method, originalUrl } = req;
    const ip = extractIp(req);

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
      const len = res.getHeader('content-length');
      const size = len ? `${String(len)}b` : '-';
      const msg = `${method} ${originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms - ${size} - ${ip}`;

      if (res.statusCode >= 500) this.logger.error(msg);
      else if (res.statusCode >= 400) this.logger.warn(msg);
      else this.logger.log(msg);
    });

    next();
  }
}

function extractIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return (Array.isArray(fwd) ? fwd[0] : fwd).split(',')[0].trim();
  return req.ip ?? '-';
}
