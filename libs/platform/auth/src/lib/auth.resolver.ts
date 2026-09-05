import { Resolver, Mutation, Args, Query } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthPayload, MessageResponse, UserAuth } from './auth.model';
import { GqlAuthGuard } from './guards';
import { CurrentUser } from './current-user.decorator';

/**
 * Auth resolver — aligned with the real `AuthService` surface (2026-08 P0
 * repair: the previous version called service methods that never existed —
 * changePassword / verifyEmail / resendVerificationEmail — and never
 * compiled; see STATUS.md). The public contract matches READY_FEATURES.md:
 * register / login / refreshToken (+ password-reset pair).
 */
@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Query(() => UserAuth, { description: 'Current authenticated user' })
  @UseGuards(GqlAuthGuard)
  async me(@CurrentUser() user: any): Promise<UserAuth> {
    const id = user?.userId ?? user?.sub ?? user?.id;
    return this.authService.me(id) as Promise<UserAuth>;
  }

  @Mutation(() => AuthPayload, {
    description: 'Register a new user and sign them in',
  })
  async register(
    @Args('email') email: string,
    @Args('password') password: string,
    @Args('name', { nullable: true }) name?: string,
  ): Promise<AuthPayload> {
    const user = await this.authService.register({ email, password, name });
    // Auto-login after signup so the client gets tokens immediately.
    const payload = await this.authService.login(email, password);
    return {
      ...payload,
      emailVerificationToken: user.emailVerificationToken ?? undefined,
    } as AuthPayload;
  }

  @Mutation(() => AuthPayload, { description: 'Login with email and password' })
  async login(
    @Args('email') email: string,
    @Args('password') password: string,
  ): Promise<AuthPayload> {
    return this.authService.login(email, password) as Promise<AuthPayload>;
  }

  @Mutation(() => MessageResponse, {
    description: 'Request password reset email',
  })
  async requestPasswordReset(
    @Args('email') email: string,
  ): Promise<MessageResponse> {
    const { token } = await this.authService.requestPasswordReset(email);
    return {
      message: 'If the account exists, a password reset email has been sent.',
      // Surfaced so dev/test flows can complete the reset without email
      // infrastructure. Null it out in production deployments.
      resetToken: process.env.NODE_ENV === 'production' ? undefined : token,
    };
  }

  @Mutation(() => MessageResponse, {
    description: 'Reset password using reset token',
  })
  async resetPassword(
    @Args('token') token: string,
    @Args('newPassword') newPassword: string,
  ): Promise<MessageResponse> {
    await this.authService.confirmPasswordReset(token, newPassword);
    return { message: 'Password has been reset. Please sign in again.' };
  }

  @Mutation(() => AuthPayload, {
    description: 'Refresh access and refresh tokens',
  })
  async refreshToken(
    @Args('refreshToken') refreshToken: string,
  ): Promise<AuthPayload> {
    return this.authService.refresh(refreshToken) as Promise<AuthPayload>;
  }
}
