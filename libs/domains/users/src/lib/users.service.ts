import { Injectable, NotFoundException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserInput } from './dto/create-user.input';
import { UpdateUserInput } from './dto/update-user.input';
import { User as PrismaUser } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserInput: CreateUserInput): Promise<PrismaUser> {
    try {
      const { roleIds, ...userData } = createUserInput;
      const data: any = { ...userData };
      if (roleIds && roleIds.length > 0) {
        data.roles = {
          connect: roleIds.map((id) => ({ id })),
        };
      }
      return await this.prisma.user.create({ 
        data,
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(`User with email ${createUserInput.email} already exists`);
        }
      }
      throw new InternalServerErrorException('Failed to create user');
    }
  }

  async findAll(): Promise<PrismaUser[]> {
    try {
      return await this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to retrieve users');
    }
  }

  async findOne(id: number): Promise<PrismaUser> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id } });
      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }
      return user;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve user');
    }
  }

  async findByEmail(email: string): Promise<PrismaUser | null> {
    try {
      return await this.prisma.user.findUnique({ where: { email } });
    } catch (error) {
      throw new InternalServerErrorException('Failed to retrieve user by email');
    }
  }

  async update(id: number, updateUserInput: UpdateUserInput): Promise<PrismaUser> {
    try {
      await this.findOne(id);
      if (updateUserInput.email) {
        const existingUserWithEmail = await this.prisma.user.findUnique({
          where: { email: updateUserInput.email }
        });
        if (existingUserWithEmail && existingUserWithEmail.id !== id) {
          throw new ConflictException(`Email ${updateUserInput.email} is already in use`);
        }
      }
      const { roleIds, ...userData } = updateUserInput;
      const data: any = {
        email: userData.email,
        name: userData.name,
      };
      if (roleIds) {
        data.roles = {
          set: roleIds.map((id) => ({ id })),
        };
      }
      return await this.prisma.user.update({ 
        where: { id }, 
        data,
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update user');
    }
  }

  async remove(id: number): Promise<PrismaUser> {
    try {
      await this.findOne(id);
      return await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to delete user');
    }
  }
} 