// Barrel for the users lib (Users + Roles) — TypeORM-backed.
// SS-decommission (2026-08): flipped from the legacy `src/users/*`
// re-exports to the local lib code (the SS-043h TypeORM port). The
// legacy tree is no longer referenced from here.

export { UsersModule, UsersModule as UsersLibModule } from './lib/users.module';
export { UsersService, UsersService as UsersLibService } from './lib/users.service';
export { UsersResolver, UsersResolver as UsersLibResolver } from './lib/users.resolver';

export { RolesModule, RolesModule as RolesLibModule } from './lib/roles.module';
export { RolesService, RolesService as RolesLibService } from './lib/roles.service';
export { RolesResolver, RolesResolver as RolesLibResolver } from './lib/roles.resolver';

export { User } from './lib/entities/user.entity';
export { Role } from './lib/role.entity';
