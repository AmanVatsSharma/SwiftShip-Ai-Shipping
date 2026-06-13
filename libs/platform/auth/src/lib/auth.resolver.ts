import { Resolver, Mutation, Args, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthPayload, MessageResponse } from './auth.model';
import { GqlAuthGuard } from './guards';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Mutation(() => AuthPayload, { description: 'Register a new user' })
  async register(
    @Args('email') email: string,
    @Args('password') password: string,
    @Args('name', { nullable: true }) name?: string,
  ): Promise<AuthPayload> {
    return this.authService.register(email, password, name);
  }

  @Mutation(() => AuthPayload, { description: 'Login with email and password' })
  async login(
    @Args('email') email: string,
    @Args('password', { nullable: true }) password?: string,
  ): Promise<AuthPayload> {
    return this.authService.login(email, password ?? '');
  }

  @Mutation(() => MessageResponse, { description: 'Request password reset email' })
  async requestPasswordReset(
    @Args('email') email: string,
  ): Promise<MessageResponse> {
    return this.authService.requestPasswordReset(email);
  }

  @Mutation(() => MessageResponse, { description: 'Reset password using reset token' })
  async resetPassword(
    @Args('token') token: string,
    @Args('newPassword') newPassword: string,
  ): Promise<MessageResponse> {
    return this.authService.resetPassword(token, newPassword);
  }

  @Mutation(() => MessageResponse, { description: 'Change password (requires auth)' })
  @UseGuards(GqlAuthGuard)
  async changePassword(
    @Context() context: any,
    @Args('currentPassword') currentPassword: string,
    @Args('newPassword') newPassword: string,
  ): Promise<MessageResponse> {
    const userId =
      context.req.user?.userId ?? context.req.user?.sub ?? context.req.user?.id;
    if (!userId) {
      throw new Error('User not authenticated');
    }
    return this.authService.changePassword(userId, currentPassword, newPassword);
  }

  @Mutation(() => MessageResponse, { description: 'Verify email using token' })
  async verifyEmail(@Args('token') token: string): Promise<MessageResponse> {
    return this.authService.verifyEmail(token);
  }

  @Mutation(() => MessageResponse, { description: 'Resend email verification token' })
  async resendVerificationEmail(
    @Args('email') email: string,
  ): Promise<MessageResponse> {
    return this.authService.resendVerificationEmail(email);
  }

  @Mutation(() => AuthPayload, { description: 'Refresh access and refresh tokens' })
  async refreshTokens(
    @Args('refreshToken') refreshToken: string,
  ): Promise<AuthPayload> {
    return this.authService.refreshTokens(refreshToken);
  }
}
