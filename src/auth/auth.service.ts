import {
  Injectable,
  Logger,
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
import { RedisService } from '../redis/redis.service';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const BCRYPT_ROUNDS = 10;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_BYTES = 64; // 128-char hex string
const REFRESH_TOKEN_TTL_DAYS = 90;
const REFRESH_TOKEN_DAYS_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

type OtpPurpose = 'login' | 'reset' | 'vault-reset';

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
  location: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  current: boolean;
}

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  private readonly googleClient = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
  );

  private readonly mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: (process.env.SMTP_PORT ?? '587') === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

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

  /** Create a Session row, cache it in Redis, return both tokens. */
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

    // Cache session in Redis so resolve() avoids a DB hit on every request.
    void this.redis.setSession(
      session.id,
      userId,
      REFRESH_TOKEN_TTL_DAYS * 86400,
    );

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
      // Resolve city+country from IP asynchronously — never blocks the login response.
      if (ip) {
        void resolveLocation(ip).then((location) => {
          if (location) {
            return this.prisma.session
              .update({ where: { id: session.id }, data: { location } })
              .catch(() => undefined);
          }
        });
      }
    }

    return {
      accessToken: this.issueAccessToken(userId, session.id),
      refreshToken: raw,
    };
  }

  // ── Per-request identity ──────────────────────────────────────────────────────

  /**
   * Resolves the caller.
   * Hot path: Redis session cache → Redis user cache → zero DB hits.
   * Cold path (cache miss): DB session → DB user → warm both caches.
   * Revoked sessions are evicted from Redis immediately, so there is no
   * grace window after revocation.
   */
  async resolve(req: Request): Promise<User> {
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      const payload = this.verifyAccessToken(authHeader.slice(7));
      if (payload) {
        // Expose the session id so logout can revoke just this device.
        (req as Request & { sessionId?: string }).sessionId = payload.jti;
        // ── Redis hot path ─────────────────────────────────────────────────────
        const cachedUserId = await this.redis.getSession(payload.jti);
        if (cachedUserId && cachedUserId === payload.sub) {
          const cachedUser = await this.redis.getUser(cachedUserId);
          if (cachedUser) return cachedUser;

          // User cache miss — fetch from DB and re-warm
          const user = await this.prisma.user.findUnique({
            where: { id: cachedUserId },
          });
          if (user) {
            void this.redis.setUser(user);
            void this.prisma.session.update({
              where: { id: payload.jti },
              data: { lastUsedAt: new Date() },
            });
            return user;
          }
        }

        // ── DB fallback (cold start / Redis miss) ──────────────────────────────
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
            // Warm both caches
            const remaining = Math.floor(
              (session.expiresAt.getTime() - Date.now()) / 1000,
            );
            void this.redis.setSession(session.id, user.id, remaining);
            void this.redis.setUser(user);
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

    const deviceKey = (req.headers['x-device-key'] as string | undefined)?.trim();
    if (deviceKey) {
      return this.prisma.user.upsert({
        where: { deviceKey },
        update: {},
        create: { deviceKey, provider: 'guest' },
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
      if (session) {
        await this.prisma.session.delete({ where: { id: session.id } });
        void this.redis.delSession(session.id, session.userId);
      }
      throw new UnauthorizedException(
        'Refresh token expired. Please log in again.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (!user) throw new UnauthorizedException('User not found.');

    // Evict old session from Redis before rotating (prevents replay on cache hit)
    await Promise.all([
      this.prisma.session.delete({ where: { id: session.id } }),
      this.redis.delSession(session.id, session.userId),
    ]);

    const tokens = await this.issueTokenPair(user.id, ip, ua, false);
    return { tokens, user };
  }

  // ── Session management ────────────────────────────────────────────────────────

  async getSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<SessionInfo[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      device: s.device,
      ipAddress: s.ipAddress,
      location: s.location,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      current: s.id === currentSessionId,
    }));
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    await Promise.all([
      this.prisma.session.deleteMany({ where: { id: sessionId, userId } }),
      this.redis.delSession(sessionId, userId),
    ]);
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await Promise.all([
      this.prisma.session.deleteMany({ where: { userId } }),
      this.redis.delUserSessions(userId),
    ]);
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
    deviceKey?: string,
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
    const name = firstName.trim();
    const parts = name.split(/\s+/);
    const base = {
      email: normalised,
      passwordHash,
      firstName: parts[0] || null,
      lastName: parts.slice(1).join(' ') || null,
      fullName: name || null,
      provider: 'email',
    };

    try {
      await this.prisma.user.create({
        data: { ...base, ...(deviceKey ? { deviceKey } : {}) },
      });
    } catch (e) {
      // P2002: deviceKey already taken by another user (e.g. a guest on the same device).
      if ((e as { code?: string }).code === 'P2002' && deviceKey) {
        await this.prisma.user.create({ data: base });
      } else {
        throw e;
      }
    }

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
    deviceKey?: string,
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
      const base = {
        googleId,
        email,
        provider: 'google',
        firstName,
        lastName,
        fullName: name,
        avatarUrl: picture,
      };
      try {
        user = await this.prisma.user.create({
          data: { ...base, ...(deviceKey ? { deviceKey } : {}) },
        });
      } catch (e) {
        // P2002: deviceKey already taken (guest on same device).
        if ((e as { code?: string }).code === 'P2002' && deviceKey) {
          user = await this.prisma.user.create({ data: base });
        } else {
          throw e;
        }
      }
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
      hasVaultPin: !!user.vaultPinHash,
    };
  }

  // ── Vault PIN ─────────────────────────────────────────────────────────────────

  /** Store a new vault PIN hash (client-hashed SHA-256). */
  async setupVaultPin(userId: string, pinHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { vaultPinHash: pinHash } });
    void this.redis.delUser(userId);
  }

  /** Returns true when the submitted hash matches the stored one. */
  async verifyVaultPin(userId: string, pinHash: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { vaultPinHash: true },
    });
    return !!user?.vaultPinHash && user.vaultPinHash === pinHash;
  }

  /** Send a vault-reset OTP to the user's registered email. */
  async requestVaultPinReset(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user?.email) throw new BadRequestException('No email on this account to send a reset code to.');
    await this.sendOtp(user.email, 'vault-reset');
  }

  /** Verify vault-reset OTP then replace the PIN hash. */
  async resetVaultPin(userId: string, otp: string, pinHash: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user?.email) throw new BadRequestException('No email on this account.');

    const email = user.email;
    const record = await this.prisma.otpCode.findFirst({
      where: { email, purpose: 'vault-reset', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new UnauthorizedException('Code expired or not found. Request a new one.');
    const valid = await bcrypt.compare(otp.trim(), record.hash);
    if (!valid) throw new UnauthorizedException('Incorrect code. Try again.');

    await this.prisma.otpCode.deleteMany({ where: { email, purpose: 'vault-reset' } });
    await this.prisma.user.update({ where: { id: userId }, data: { vaultPinHash: pinHash } });
    void this.redis.delUser(userId);
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

    // Send the email without blocking the response. The first SMTP handshake to
    // Gmail can take several seconds (often combined with a cold DB), which made
    // the very first signup/login request time out on the client. The OTP row is
    // already persisted above, so it's safe to fire-and-forget; the client shows
    // "code sent" immediately and can use "Resend" if delivery ever fails.
    const isReset = purpose === 'reset';
    const isVaultReset = purpose === 'vault-reset';
    const subject = isReset
      ? `Reset your NetWorth password: ${code}`
      : isVaultReset
      ? `Reset your NetWorth vault PIN: ${code}`
      : `Your NetWorth verification code: ${code}`;
    const text = isReset
      ? `Your password reset code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`
      : isVaultReset
      ? `Your vault PIN reset code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`
      : `Your verification code is ${code}. It expires in 10 minutes.`;
    void this.mailer
      .sendMail({
        from: `"NetWorth" <${process.env.SMTP_USER}>`,
        to: email,
        subject,
        text,
        html: otpEmailHtml(code, isReset || isVaultReset),
      })
      .catch((e: unknown) => {
        this.log.warn(
          `Failed to send OTP email to ${email}: ${e instanceof Error ? e.message : String(e)}`,
        );
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
  if (ua.startsWith('Mozilla/')) {
    // Standard browser User-Agent — run through the parser.
    const parser = new UAParser(ua);
    const browser = parser.getBrowser().name ?? 'Unknown Browser';
    const os = parser.getOS().name ?? 'Unknown OS';
    return `${browser} on ${os}`;
  }
  // Raw axios default UA ("axios/1.x") with no device info.
  if (ua.startsWith('axios/')) return 'NetWorth App';
  // Already a formatted device string from X-Device-Model ("Pixel 7a (Android 14)").
  return ua;
}

/** Resolve an IP address to "City, Country" using ip-api.com (fire-and-forget only). */
async function resolveLocation(ip: string): Promise<string | null> {
  // Skip RFC-1918 / loopback ranges — they won't resolve to a real place.
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) || ip === '::1') {
    return null;
  }
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,country`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { status: string; city?: string; country?: string };
    if (data.status !== 'success' || !data.country) return null;
    return data.city ? `${data.city}, ${data.country}` : data.country;
  } catch {
    return null;
  }
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
