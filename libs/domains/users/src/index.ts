// Re-export barrel for the users lib (Users + Roles).
// The auth platform lib already provides the JWT auth glue, so this lib
// exposes user/role management as a TypeORM-backed service.

export { UsersModule, UsersModule as UsersLibModule } from '../../../../src/users/users.module';
export { UsersService, UsersService as UsersLibService } from '../../../../src/users/users.service';
export { UsersResolver, UsersResolver as UsersLibResolver } from '../../../../src/users/users.resolver';

export { RolesModule, RolesModule as RolesLibModule } from '../../../../src/users/roles.module';
export { RolesService, RolesService as RolesLibService } from '../../../../src/users/roles.service';
export { RolesResolver, RolesResolver as RolesLibResolver } from '../../../../src/users/roles.resolver';
