// Re-export the TypeORM-backed AuthService from the platform lib so the
// existing GraphQL resolver wiring (in auth.resolver.ts) keeps working
// while the rest of the codebase migrates to @swiftship/platform-auth.
export { AuthService } from '../../libs/platform/auth/src/lib/auth.service';
