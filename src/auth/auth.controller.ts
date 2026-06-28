import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { IdentityGuard } from './identity.guard';
import type { AuthedRequest } from './identity.guard';
import {
  EmailPasswordDto,
  RegisterDto,
  VerifyOtpDto,
  EmailDto,
  ResetPasswordDto,
  GoogleTokenDto,
  RefreshDto,
} from './dto';

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded)
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded)
      .split(',')[0]
      .trim();
  return req.ip ?? null;
}

function extractUa(req: Request): string | null {
  return req.headers['user-agent'] ?? null;
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ── Email sign-in ────────────────────────────────────────────────────────────

  @Post('email/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 300_000 } })
  async emailLogin(@Body() dto: EmailPasswordDto) {
    await this.auth.emailLogin(dto.email, dto.password);
    return { ok: true };
  }

  // ── Email sign-up ────────────────────────────────────────────────────────────

  @Post('email/register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ auth: { limit: 10, ttl: 300_000 } })
  async emailRegister(@Body() dto: RegisterDto) {
    await this.auth.emailRegister(dto.firstName, dto.email, dto.password);
    return { ok: true };
  }

  // ── OTP ───────────────────────────────────────────────────────────────────────

  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ otp: { limit: 10, ttl: 300_000 } })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    const { tokens, user } = await this.auth.verifyEmailOtp(
      dto.email,
      dto.otp,
      extractIp(req),
      extractUa(req),
    );
    return { ...tokens, user: this.auth.meDto(user) };
  }

  @Post('email/resend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ otp: { limit: 5, ttl: 900_000 } })
  async resendOtp(@Body() dto: EmailDto) {
    await this.auth.resendOtp(dto.email);
    return { ok: true };
  }

  // ── Password reset ───────────────────────────────────────────────────────────

  @Post('email/forgot')
  @HttpCode(HttpStatus.OK)
  @Throttle({ otp: { limit: 5, ttl: 900_000 } })
  async forgotPassword(@Body() dto: EmailDto) {
    await this.auth.forgotPassword(dto.email);
    return { ok: true };
  }

  @Post('email/reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ otp: { limit: 10, ttl: 300_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    const { tokens, user } = await this.auth.resetPassword(
      dto.email,
      dto.otp,
      dto.newPassword,
      extractIp(req),
      extractUa(req),
    );
    return { ...tokens, user: this.auth.meDto(user) };
  }

  // ── Google ───────────────────────────────────────────────────────────────────

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 300_000 } })
  async googleLogin(@Body() dto: GoogleTokenDto, @Req() req: Request) {
    const { tokens, user } = await this.auth.loginWithGoogleToken(
      dto.idToken,
      extractIp(req),
      extractUa(req),
    );
    return { ...tokens, user: this.auth.meDto(user) };
  }

  // ── Token refresh ────────────────────────────────────────────────────────────

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ refresh: { limit: 30, ttl: 60_000 } })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    const { tokens, user } = await this.auth.refreshTokens(
      dto.refreshToken,
      extractIp(req),
      extractUa(req),
    );
    return { ...tokens, user: this.auth.meDto(user) };
  }

  // ── Session management (requires auth) ───────────────────────────────────────

  @Get('sessions')
  @UseGuards(IdentityGuard)
  async getSessions(@Req() req: AuthedRequest) {
    return this.auth.getSessions(req.user.id, req.sessionId);
  }

  @Delete('sessions/:id')
  @UseGuards(IdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(@Param('id') id: string, @Req() req: AuthedRequest) {
    await this.auth.revokeSession(id, req.user.id);
  }

  /** Sign out the current device only (revokes this session). */
  @Post('logout')
  @UseGuards(IdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: AuthedRequest) {
    if (req.sessionId)
      await this.auth.revokeSession(req.sessionId, req.user.id);
    else await this.auth.revokeAllSessions(req.user.id);
  }

  /** Sign out everywhere (revokes all sessions for the user). */
  @Post('logout-all')
  @UseGuards(IdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@Req() req: AuthedRequest) {
    await this.auth.revokeAllSessions(req.user.id);
  }
}
