// Re-export JwtStrategy from the platform lib so decorators in the existing
// `imports: [PassportModule, AuthModule]` chain still resolve.
export { JwtStrategy } from '../../libs/platform/auth/src/lib/jwt.strategy';
