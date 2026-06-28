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
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
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
  VaultPinDto,
  VaultPinResetDto,
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
  // Prefer the custom header sent by the mobile client — it carries the real
  // device model ("Pixel 7a (Android 14)"), which ua-parser-js can't derive
  // from the raw axios User-Agent string.
  return (
    (req.headers['x-device-model'] as string | undefined)?.trim() ||
    req.headers['user-agent'] ||
    null
  );
}

// ── Controller ────────────────────────────────────────────────────────────────

// Class-level default so routes without their own @Throttle (sessions, logout,
// vault/setup, vault/verify) don't inherit ALL 4 global throttlers — which
// would apply the otp (5/15min) limit and lock users out after 5 vault unlocks.
@ApiTags('Auth')
@Controller('auth')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ── Email sign-in ────────────────────────────────────────────────────────────

  @Post('email/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 300_000 } })
  @ApiOperation({ summary: 'Start email sign-in — sends OTP to the email address' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async emailLogin(@Body() dto: EmailPasswordDto) {
    await this.auth.emailLogin(dto.email, dto.password);
    return { ok: true };
  }

  // ── Email sign-up ────────────────────────────────────────────────────────────

  @Post('email/register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ auth: { limit: 10, ttl: 300_000 } })
  @ApiOperation({ summary: 'Register a new account — sends OTP to verify email' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async emailRegister(@Body() dto: RegisterDto, @Req() req: Request) {
    const deviceKey = (req.headers['x-device-key'] as string | undefined)?.trim() || undefined;
    await this.auth.emailRegister(dto.firstName, dto.email, dto.password, deviceKey);
    return { ok: true };
  }

  // ── OTP ───────────────────────────────────────────────────────────────────────

  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ otp: { limit: 10, ttl: 300_000 } })
  @ApiOperation({ summary: 'Verify OTP — returns access + refresh tokens and user profile' })
  @ApiOkResponse({
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiJ9...',
        user: { id: 'clx...', email: 'user@example.com', firstName: 'Rahul', onboarded: true },
      },
    },
  })
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
  @ApiOperation({ summary: 'Resend login/registration OTP (max 5 per 15 min)' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async resendOtp(@Body() dto: EmailDto) {
    await this.auth.resendOtp(dto.email);
    return { ok: true };
  }

  // ── Password reset ───────────────────────────────────────────────────────────

  @Post('email/forgot')
  @HttpCode(HttpStatus.OK)
  @Throttle({ otp: { limit: 5, ttl: 900_000 } })
  @ApiOperation({ summary: 'Send password-reset OTP to email (max 5 per 15 min)' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async forgotPassword(@Body() dto: EmailDto) {
    await this.auth.forgotPassword(dto.email);
    return { ok: true };
  }

  @Post('email/reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ otp: { limit: 10, ttl: 300_000 } })
  @ApiOperation({ summary: 'Verify reset OTP + set new password — returns tokens' })
  @ApiOkResponse({
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiJ9...',
        user: { id: 'clx...', email: 'user@example.com' },
      },
    },
  })
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
  @ApiOperation({ summary: 'Sign in / sign up with a Google ID token' })
  @ApiOkResponse({
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiJ9...',
        user: { id: 'clx...', email: 'user@gmail.com', firstName: 'Rahul' },
      },
    },
  })
  async googleLogin(@Body() dto: GoogleTokenDto, @Req() req: Request) {
    const deviceKey = (req.headers['x-device-key'] as string | undefined)?.trim() || undefined;
    const { tokens, user } = await this.auth.loginWithGoogleToken(
      dto.idToken,
      extractIp(req),
      extractUa(req),
      deviceKey,
    );
    return { ...tokens, user: this.auth.meDto(user) };
  }

  // ── Token refresh ────────────────────────────────────────────────────────────

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ refresh: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Exchange refresh token for a new access + refresh token pair' })
  @ApiOkResponse({
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiJ9...',
      },
    },
  })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    const { tokens, user } = await this.auth.refreshTokens(
      dto.refreshToken,
      extractIp(req),
      extractUa(req),
    );
    return { ...tokens, user: this.auth.meDto(user) };
  }

  // ── Session management ────────────────────────────────────────────────────────

  @Get('sessions')
  @UseGuards(IdentityGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List all active sessions for the current user' })
  @ApiOkResponse({
    schema: {
      example: [
        {
          id: 'clx...', device: 'Pixel 7a (Android 14)', location: 'Mumbai, IN',
          ipAddress: '1.2.3.4', lastUsedAt: '2026-06-01T10:00:00Z', current: true,
        },
      ],
    },
  })
  async getSessions(@Req() req: AuthedRequest) {
    return this.auth.getSessions(req.user.id, req.sessionId);
  }

  @Delete('sessions/:id')
  @UseGuards(IdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Revoke a specific session (sign out a device)' })
  @ApiNoContentResponse()
  async revokeSession(@Param('id') id: string, @Req() req: AuthedRequest) {
    await this.auth.revokeSession(id, req.user.id);
  }

  @Post('logout')
  @UseGuards(IdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Sign out current device' })
  @ApiNoContentResponse()
  async logout(@Req() req: AuthedRequest) {
    if (req.sessionId)
      await this.auth.revokeSession(req.sessionId, req.user.id);
    else await this.auth.revokeAllSessions(req.user.id);
  }

  @Post('logout-all')
  @UseGuards(IdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Sign out all devices' })
  @ApiNoContentResponse()
  async logoutAll(@Req() req: AuthedRequest) {
    await this.auth.revokeAllSessions(req.user.id);
  }

  // ── Vault PIN ─────────────────────────────────────────────────────────────────

  @ApiTags('Vault')
  @Post('vault/setup')
  @UseGuards(IdentityGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Set or change vault PIN (stored as SHA-256 hash)' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async setupVaultPin(@Req() req: AuthedRequest, @Body() dto: VaultPinDto) {
    await this.auth.setupVaultPin(req.user.id, dto.pinHash);
    return { ok: true };
  }

  @ApiTags('Vault')
  @Post('vault/verify')
  @UseGuards(IdentityGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Verify vault PIN — returns ok: true/false' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async verifyVaultPin(@Req() req: AuthedRequest, @Body() dto: VaultPinDto) {
    const ok = await this.auth.verifyVaultPin(req.user.id, dto.pinHash);
    return { ok };
  }

  @ApiTags('Vault')
  @Post('vault/reset-request')
  @UseGuards(IdentityGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ otp: { limit: 5, ttl: 900_000 } })
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Send vault PIN reset OTP to registered email (max 5 per 15 min)' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async vaultPinResetRequest(@Req() req: AuthedRequest) {
    await this.auth.requestVaultPinReset(req.user.id);
    return { ok: true };
  }

  @ApiTags('Vault')
  @Post('vault/reset-verify')
  @UseGuards(IdentityGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ otp: { limit: 10, ttl: 300_000 } })
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Verify reset OTP and set new vault PIN' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async vaultPinResetVerify(@Req() req: AuthedRequest, @Body() dto: VaultPinResetDto) {
    await this.auth.resetVaultPin(req.user.id, dto.otp, dto.pinHash);
    return { ok: true };
  }
}
