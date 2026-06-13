import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleInput } from './dto/create-role.input';
import { UpdateRoleInput } from './dto/update-role.input';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async create(createRoleInput: CreateRoleInput) {
    return this.prisma.role.create({ data: createRoleInput });
  }

  async findAll() {
    return this.prisma.role.findMany();
  }

  async findOne(id: number) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException(`Role with ID ${id} not found`);
    return role;
  }

  async update(updateRoleInput: UpdateRoleInput) {
    const { id, ...data } = updateRoleInput;
    return this.prisma.role.update({ where: { id }, data });
  }

  async remove(id: number) {
    return this.prisma.role.delete({ where: { id } });
  }
} 