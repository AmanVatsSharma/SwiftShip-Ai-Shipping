import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleEntity } from '@swiftship/platform-typeorm';
import { CreateRoleInput } from './dto/create-role.input';
import { UpdateRoleInput } from './dto/update-role.input';

/**
 * Roles service (TypeORM-backed).
 *
 * Prisma → TypeORM call-site mapping (see MIGRATION.md §7):
 *   prisma.role.create({ data })  → repo.create + repo.save
 *   prisma.role.findMany()        → repo.find()
 *   prisma.role.findUnique(...)   → repo.findOne({ where })
 *   prisma.role.update(...)       → Object.assign + repo.save
 *   prisma.role.delete(...)       → repo.remove
 */
@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
  ) {}

  async create(createRoleInput: CreateRoleInput): Promise<RoleEntity> {
    const role = this.roles.create({
      name: createRoleInput.name,
      description: createRoleInput.description ?? null,
    });
    return this.roles.save(role);
  }

  async findAll(): Promise<RoleEntity[]> {
    return this.roles.find({ relations: { users: false } });
  }

  async findOne(id: number): Promise<RoleEntity> {
    const role = await this.roles.findOne({ where: { id } });
    if (!role) throw new NotFoundException(`Role with ID ${id} not found`);
    return role;
  }

  async update(updateRoleInput: UpdateRoleInput): Promise<RoleEntity> {
    const { id, ...data } = updateRoleInput;
    const role = await this.findOne(id);
    Object.assign(role, data);
    return this.roles.save(role);
  }

  async remove(id: number): Promise<RoleEntity> {
    const role = await this.findOne(id);
    return this.roles.remove(role);
  }
}
