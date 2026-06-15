import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleEntity, UserEntity } from '@swiftship/platform-typeorm';
import { UsersResolver } from './users.resolver';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, RoleEntity])],
  providers: [UsersResolver, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
