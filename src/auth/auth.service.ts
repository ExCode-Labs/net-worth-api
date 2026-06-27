import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as nodemailer from 'nodemailer';
import { UAParser } from 'ua-parser-js';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type { Request } from 'express';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const BCRYPT_ROUNDS = 10;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_BYTES = 64; // 128-char hex string
const REFRESH_TOKEN_TTL_DAYS = 90;
const REFRESH_TOKEN_DAYS_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

type OtpPurpose = 'login' | 'reset';

interface AccessPayload {
  sub: string;
  jti: string; // session id
  type: 'access';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface SessionInfo {
  id: string;
  device: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastUsedAt: Date;
}

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
  );

  private readonly mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: (process.env.SMTP_PORT ?? '587') === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  constructor(private readonly prisma: PrismaService) {}

  // ── Token helpers ─────────────────────────────────────────────────────────────

  private get jwtSecret(): string {
    const s = process.env.APP_JWT_SECRET;
    if (!s) throw new UnauthorizedException('Server auth not configured');
    return s;
  }

  private issueAccessToken(userId: string, sessionId: string): string {
    const payload: AccessPayload = {
      sub: userId,
      jti: sessionId,
      type: 'access',
    };
    return jwt.sign(payload, this.jwtSecret, { expiresIn: ACCESS_TOKEN_TTL });
  }

  private verifyAccessToken(token: string): AccessPayload | null {
    try {
      const p = jwt.verify(token, this.jwtSecret) as Record<string, unknown>;
      if (
        p['type'] !== 'access' ||
        typeof p['sub'] !== 'string' ||
        typeof p['jti'] !== 'string'
      )
        return null;
      return { sub: p['sub'], jti: p['jti'], type: 'access' };
    } catch {
      return null;
    }
  }

  private generateRefreshToken(): { raw: string; hash: string } {
    const raw = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    return { raw, hash };
  }

  /** Create a Session row and return both tokens. Sends a login email if user has one. */
  private async issueTokenPair(
    userId: string,
    ip: string | null,
    ua: string | null,
    sendNotification = true,
  ): Promise<TokenPair> {
    const { raw, hash } = this.generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS_MS);
    const device = ua ? parseDevice(ua) : null;

    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: hash,
        ipAddress: ip,
        userAgent: ua,
        device,
        expiresAt,
      },
    });

    if (sendNotification) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user?.email) {
        void this.sendLoginNotificationEmail(
          user.email,
          ip,
          device,
          session.createdAt,
        );
      }
    }

    return {
      accessToken: this.issueAccessToken(userId, session.id),
      refreshToken: raw,
    };
  }

  // ── Per-request identity ──────────────────────────────────────────────────────

  /**
   * Resolves the caller. Short-lived access tokens are verified cryptographically
   * and then checked against the session table so revoked sessions are rejected
   * immediately (not just when the JWT expires).
   */
  async resolve(req: Request): Promise<User> {
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      const payload = this.verifyAccessToken(authHeader.slice(7));
      if (payload) {
        const session = await this.prisma.session.findUnique({
          where: { id: payload.jti },
        });
        if (
          session &&
          session.userId === payload.sub &&
          session.expiresAt > new Date()
        ) {
          const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
          });
          if (user) {
            void this.prisma.session.update({
              where: { id: session.id },
              data: { lastUsedAt: new Date() },
            });
            return user;
          }
        }
      }
      throw new UnauthorizedException(
        'Invalid or expired session. Please log in again.',
      );
    }

    const guestKey = (req.headers['x-guest-key'] as string | undefined)?.trim();
    if (guestKey) {
      return this.prisma.user.upsert({
        where: { guestKey },
        update: {},
        create: { guestKey, provider: 'guest' },
      });
    }

    throw new UnauthorizedException('Missing credentials');
  }

  // ── Refresh tokens ────────────────────────────────────────────────────────────

  /**
   * Rotate: verify refresh token → delete old session → create new session →
   * return new token pair. Any replay of the old refresh token will fail.
   */
  async refreshTokens(
    rawRefreshToken: string,
    ip: string | null,
    ua: string | null,
  ): Promise<{ tokens: TokenPair; user: User }> {
    const hash = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hash },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session)
        await this.prisma.session.delete({ where: { id: session.id } });
      throw new UnauthorizedException(
        'Refresh token expired. Please log in again.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (!user) throw new UnauthorizedException('User not found.');

    // Delete old session before creating new one (token rotation)
    await this.prisma.session.delete({ where: { id: session.id } });

    // Only send login notification on first login, not on routine refreshes
    const tokens = await this.issueTokenPair(user.id, ip, ua, false);
    return { tokens, user };
  }

  // ── Session management ────────────────────────────────────────────────────────

  async getSessions(userId: string): Promise<SessionInfo[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      device: s.device,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
    }));
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { id: sessionId, userId },
    });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  // ── Email sign-in ─────────────────────────────────────────────────────────────

  async emailLogin(email: string, password: string): Promise<void> {
    const normalised = email.toLowerCase().trim();
    const user = await this.prisma.user.findFirst({
      where: { email: normalised },
    });

    if (!user)
      throw new BadRequestException(
        'No account with that email. Please sign up first.',
      );
    if (!user.passwordHash) {
      throw new BadRequestException(
        'This email uses Google sign-in. Use "Continue with Google" instead.',
      );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Incorrect password.');

    await this.sendOtp(normalised, 'login');
  }

  // ── Email sign-up ─────────────────────────────────────────────────────────────

  async emailRegister(
    firstName: string,
    email: string,
    password: string,
  ): Promise<void> {
    const normalised = email.toLowerCase().trim();
    const existing = await this.prisma.user.findFirst({
      where: { email: normalised },
    });
    if (existing) {
      throw new ConflictException(
        'An account with this email already exists. Please sign in.',
      );
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.user.create({
      data: {
        email: normalised,
        passwordHash,
        firstName: firstName.trim() || null,
        fullName: firstName.trim() || null,
        provider: 'email',
      },
    });

    await this.sendOtp(normalised, 'login');
  }

  // ── OTP verify ────────────────────────────────────────────────────────────────

  async verifyEmailOtp(
    email: string,
    otp: string,
    ip: string | null,
    ua: string | null,
  ): Promise<{ tokens: TokenPair; user: User }> {
    const normalised = email.toLowerCase().trim();
    const record = await this.prisma.otpCode.findFirst({
      where: {
        email: normalised,
        purpose: 'login',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!record)
      throw new UnauthorizedException(
        'Code expired or not found. Request a new one.',
      );

    const valid = await bcrypt.compare(otp.trim(), record.hash);
    if (!valid) throw new UnauthorizedException('Incorrect code. Try again.');

    await this.prisma.otpCode.delete({ where: { id: record.id } });

    const user = await this.prisma.user.findFirst({
      where: { email: normalised },
    });
    if (!user) throw new UnauthorizedException('User not found.');

    const tokens = await this.issueTokenPair(user.id, ip, ua);
    return { tokens, user };
  }

  async resendOtp(email: string): Promise<void> {
    const normalised = email.toLowerCase().trim();
    const exists = await this.prisma.user.findFirst({
      where: { email: normalised },
    });
    if (!exists) throw new BadRequestException('Unknown email.');
    await this.sendOtp(normalised, 'login');
  }

  // ── Forgot / reset password ───────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<void> {
    const normalised = email.toLowerCase().trim();
    const user = await this.prisma.user.findFirst({
      where: { email: normalised },
    });
    if (!user?.passwordHash) return; // silent — prevent enumeration
    await this.sendOtp(normalised, 'reset');
  }

  async resetPassword(
    email: string,
    otp: string,
    newPassword: string,
    ip: string | null,
    ua: string | null,
  ): Promise<{ tokens: TokenPair; user: User }> {
    const normalised = email.toLowerCase().trim();
    const record = await this.prisma.otpCode.findFirst({
      where: {
        email: normalised,
        purpose: 'reset',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!record)
      throw new UnauthorizedException(
        'Code expired or not found. Request a new one.',
      );

    const valid = await bcrypt.compare(otp.trim(), record.hash);
    if (!valid) throw new UnauthorizedException('Incorrect code. Try again.');

    await this.prisma.otpCode.delete({ where: { id: record.id } });

    const found = await this.prisma.user.findFirst({
      where: { email: normalised },
    });
    if (!found) throw new UnauthorizedException('User not found.');

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const user = await this.prisma.user.update({
      where: { id: found.id },
      data: { passwordHash },
    });

    // Revoke all existing sessions on password reset (security)
    await this.revokeAllSessions(user.id);
    const tokens = await this.issueTokenPair(user.id, ip, ua);
    return { tokens, user };
  }

  // ── Google ────────────────────────────────────────────────────────────────────

  async loginWithGoogleToken(
    idToken: string,
    ip: string | null,
    ua: string | null,
  ): Promise<{ tokens: TokenPair; user: User }> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId)
      throw new UnauthorizedException('Google auth not configured.');

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google token.');
    }

    if (!payload?.sub)
      throw new UnauthorizedException('Google token has no subject.');

    const googleId = payload.sub;
    const email = payload.email?.toLowerCase() ?? null;
    const picture = payload.picture ?? null;
    const name = payload.name ?? null;

    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId }, ...(email ? [{ email }] : [])] },
    });

    if (user) {
      if (!user.googleId) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId,
            provider: 'google',
            avatarUrl: picture ?? user.avatarUrl,
          },
        });
      }
    } else {
      const parts = (name ?? '').split(' ');
      const firstName = parts[0] || null;
      const lastName = parts.slice(1).join(' ') || null;
      user = await this.prisma.user.create({
        data: {
          googleId,
          email,
          provider: 'google',
          firstName,
          lastName,
          fullName: name,
          avatarUrl: picture,
        },
      });
    }

    const tokens = await this.issueTokenPair(user.id, ip, ua);
    return { tokens, user };
  }

  // ── Me DTO ────────────────────────────────────────────────────────────────────

  meDto(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      provider: user.provider,
      phone: user.phone,
      currency: user.currency,
      guestName: user.guestName,
      onboarded: user.onboarded,
    };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────────

  private async sendOtp(email: string, purpose: OtpPurpose): Promise<void> {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const hash = await bcrypt.hash(code, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.prisma.otpCode.deleteMany({ where: { email, purpose } });
    await this.prisma.otpCode.create({
      data: { email, hash, purpose, expiresAt },
    });

    const isReset = purpose === 'reset';
    await this.mailer.sendMail({
      from: `"NetWorth" <${process.env.SMTP_USER}>`,
      to: email,
      subject: isReset
        ? `Reset your NetWorth password: ${code}`
        : `Your NetWorth verification code: ${code}`,
      text: isReset
        ? `Your password reset code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`
        : `Your verification code is ${code}. It expires in 10 minutes.`,
      html: otpEmailHtml(code, isReset),
    });
  }

  private sendLoginNotificationEmail(
    email: string,
    ip: string | null,
    device: string | null,
    time: Date,
  ): void {
    const timeStr = time.toUTCString();
    void this.mailer
      .sendMail({
        from: `"NetWorth Security" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'New sign-in to your NetWorth account',
        text: `A new sign-in was detected.\nDevice: ${device ?? 'Unknown'}\nIP: ${ip ?? 'Unknown'}\nTime: ${timeStr}\n\nIf this was not you, sign in and revoke this session immediately.`,
        html: loginNotificationHtml(device, ip, timeStr),
      })
      .catch(() => undefined);
  }
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

function parseDevice(ua: string): string {
  const parser = new UAParser(ua);
  const browser = parser.getBrowser().name ?? 'Unknown Browser';
  const os = parser.getOS().name ?? 'Unknown OS';
  return `${browser} on ${os}`;
}

function otpEmailHtml(code: string, isReset: boolean): string {
  return `
    <div style="font-family:sans-serif;max-width:420px;margin:auto;padding:24px">
      <h2 style="color:#6366f1;margin:0 0 16px">NetWorth</h2>
      <p style="color:#374151;margin:0 0 8px">${isReset ? 'Your password reset code:' : 'Your verification code:'}</p>
      <div style="background:#f3f4f6;border-radius:12px;padding:20px;text-align:center;margin:12px 0">
        <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#111">${code}</span>
      </div>
      <p style="color:#6b7280;font-size:13px;margin:12px 0 0">
        ${isReset ? 'If you did not request a password reset, you can safely ignore this email.' : 'Do not share this code with anyone.'}
        Expires in 10 minutes.
      </p>
    </div>`;
}

function loginNotificationHtml(
  device: string | null,
  ip: string | null,
  time: string,
): string {
  return `
    <div style="font-family:sans-serif;max-width:420px;margin:auto;padding:24px">
      <h2 style="color:#6366f1;margin:0 0 8px">New sign-in detected</h2>
      <p style="color:#374151">Someone just signed in to your NetWorth account.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px 0;color:#6b7280;width:80px">Device</td><td style="padding:8px 0;color:#111;font-weight:600">${device ?? 'Unknown'}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">IP</td><td style="padding:8px 0;color:#111;font-weight:600">${ip ?? 'Unknown'}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Time</td><td style="padding:8px 0;color:#111;font-weight:600">${time}</td></tr>
      </table>
      <p style="color:#ef4444;font-size:13px">If this was not you, sign in immediately and revoke this session from Settings → Security → Active Sessions.</p>
    </div>`;
}
