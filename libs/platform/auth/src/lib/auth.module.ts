import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity, RefreshTokenEntity } from '@swiftship/platform-typeorm';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { GqlAuthGuard } from './auth.guards';
import { RolesGuard } from './roles.decorator';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    TypeOrmModule.forFeature([UserEntity, RefreshTokenEntity]),
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      useFactory: async (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET', 'dev-secret'),
        signOptions: {
          expiresIn:
            (cfg.get<number>('JWT_EXPIRES_IN_MS') as any) ??
            (cfg.get<string>('JWT_EXPIRES_IN', '15m') as any),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy, GqlAuthGuard, RolesGuard],
  exports: [AuthService, GqlAuthGuard, RolesGuard, JwtModule],
})
export class AuthLibModule {}
