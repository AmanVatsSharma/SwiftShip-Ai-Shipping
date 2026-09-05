import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { UserEntity, RefreshTokenEntity } from '@swiftship/platform-typeorm';

/**
 * Auth Service (TypeORM-backed).
 *
 * Provides comprehensive authentication and authorization functionality.
 *
 * Features:
 * - User registration with password hashing
 * - Email/password login
 * - Password reset flow
 * - Email verification
 * - JWT token generation
 * - Session management
 *
 * Security:
 * - Passwords are hashed using bcrypt with salt rounds
 * - Tokens are generated with expiration
 * - Email verification tokens expire after 24 hours
 * - Password reset tokens expire after 1 hour
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokens: Repository<RefreshTokenEntity>,
    private readonly jwt: JwtService,
  ) {}

  // ---- current user
  /** Load the authenticated user's public shape (the `me` query). */
  async me(userId: number) {
    const user = await this.users.findOne({
      where: { id: userId },
      relations: ['roles'],
    });
    if (!user) throw new UnauthorizedException('User not found');
    return this.toPublic(user);
  }

  // ---- registration
  async register(input: { email: string; password: string; name?: string }) {
    const existing = await this.users.findOne({
      where: { email: input.email },
    });
    if (existing) throw new BadRequestException('Email already in use');

    const passwordHash = await bcrypt.hash(input.password, 12);
    const emailVerificationToken = randomBytes(32).toString('hex');
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = this.users.create({
      email: input.email,
      name: input.name,
      password: passwordHash,
      emailVerificationToken,
      emailVerificationExpires,
    });
    return this.users.save(user);
  }

  // ---- login
  async login(email: string, password: string) {
    const user = await this.users.findOne({
      where: { email },
      relations: ['roles'],
    });
    if (!user || !user.password)
      throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    user.lastLoginAt = new Date();
    await this.users.save(user);

    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user.id);
    return { accessToken, refreshToken, user: this.toPublic(user) };
  }

  // ---- refresh
  async refresh(token: string) {
    const hashed = createHash('sha256').update(token).digest('hex');
    const record = await this.refreshTokens.findOne({
      where: { token: hashed, revokedAt: undefined as any },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.users.findOne({
      where: { id: record.userId },
      relations: ['roles'],
    });
    if (!user) throw new UnauthorizedException('Invalid refresh token');
    record.revokedAt = new Date();
    await this.refreshTokens.save(record);
    const newAccess = this.signAccessToken(user);
    const newRefresh = await this.issueRefreshToken(user.id);
    return { accessToken: newAccess, refreshToken: newRefresh };
  }

  // ---- password reset request
  async requestPasswordReset(email: string) {
    const user = await this.users.findOne({ where: { email } });
    if (!user) throw new NotFoundException('User not found');
    const token = randomBytes(32).toString('hex');
    user.passwordResetToken = token;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await this.users.save(user);
    return { token };
  }

  async confirmPasswordReset(token: string, newPassword: string) {
    const user = await this.users.findOne({
      where: { passwordResetToken: token },
    });
    if (
      !user ||
      !user.passwordResetExpires ||
      user.passwordResetExpires < new Date()
    ) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    user.password = await bcrypt.hash(newPassword, 12);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await this.users.save(user);
    return { ok: true };
  }

  // ---- helpers
  private signAccessToken(user: UserEntity): string {
    const payload = {
      sub: user.id,
      email: user.email,
      roles: user.roles?.map((r) => r.name) ?? [],
    };
    return this.jwt.sign(payload);
  }

  private async issueRefreshToken(userId: number): Promise<string> {
    const raw = randomBytes(48).toString('hex');
    const hashed = createHash('sha256').update(raw).digest('hex');
    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId,
        token: hashed,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30d
      }),
    );
    return raw;
  }

  private toPublic(user: UserEntity) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified ?? false,
      createdAt: user.createdAt,
      roles: user.roles?.map((r) => r.name) ?? [],
    };
  }
}
