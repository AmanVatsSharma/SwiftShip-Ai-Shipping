// Test-only stub for @swiftship/domains-tenants. Avoids the heavy
// onboarding/tenant module load (which transitively pulls in
// @InjectRepository(UserEntity) and the platform-typeorm barrel).

export { TenantContext } from './tenant-context-stub';
