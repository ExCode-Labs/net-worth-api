import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '@prisma/client';
import { AuthService } from './auth.service';

export interface AuthedRequest extends Request {
  user: User;
  /** Session id of the access token, set by AuthService.resolve. */
  sessionId?: string;
}

/** Resolves the caller's User and attaches it to `req.user`. */
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    req.user = await this.auth.resolve(req);
    return true;
  }
}
