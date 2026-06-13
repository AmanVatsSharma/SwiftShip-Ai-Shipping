// The real AuthModule is now in libs/platform/auth (TypeORM-backed).
// Re-export it so the legacy `AppModule.imports: [AuthModule]` continues
// to work during the migration.
export { AuthLibModule as AuthModule } from '../../libs/platform/auth/src/lib/auth.module';
