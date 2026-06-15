import { Injectable, NotFoundException, ConflictException, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { RoleEntity, UserEntity } from '@swiftship/platform-typeorm';
import { CreateUserInput } from './dto/create-user.input';
import { UpdateUserInput } from './dto/update-user.input';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
  ) {}

  async create(createUserInput: CreateUserInput): Promise<UserEntity> {
    try {
      const { roleIds, ...userData } = createUserInput;
      const user = this.users.create({
        email: userData.email,
        name: userData.name,
      });
      const saved = await this.users.save(user);
      if (roleIds && roleIds.length > 0) {
        const foundRoles = await this.roles.find({ where: { id: In(roleIds) } });
        if (foundRoles.length > 0) {
          saved.roles = foundRoles;
          await this.users.save(saved);
        }
      }
      return saved;
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const driver = (error as QueryFailedError & { driverError?: { code?: string } })
          .driverError;
        if (driver?.code === '23505') {
          throw new ConflictException(
            `User with email ${createUserInput.email} already exists`,
          );
        }
      }
      this.logger.error('Failed to create user', error as Error);
      throw new InternalServerErrorException('Failed to create user');
    }
  }

  async findAll(): Promise<UserEntity[]> {
    try {
      return await this.users.find({
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error('Failed to retrieve users', error as Error);
      throw new InternalServerErrorException('Failed to retrieve users');
    }
  }

  async findOne(id: number): Promise<UserEntity> {
    try {
      const user = await this.users.findOne({ where: { id } });
      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }
      return user;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Failed to retrieve user', error as Error);
      throw new InternalServerErrorException('Failed to retrieve user');
    }
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    try {
      return await this.users.findOne({ where: { email } });
    } catch (error) {
      this.logger.error('Failed to retrieve user by email', error as Error);
      throw new InternalServerErrorException('Failed to retrieve user by email');
    }
  }

  async update(id: number, updateUserInput: UpdateUserInput): Promise<UserEntity> {
    try {
      await this.findOne(id);
      if (updateUserInput.email) {
        const existingUserWithEmail = await this.users.findOne({
          where: { email: updateUserInput.email },
        });
        if (existingUserWithEmail && existingUserWithEmail.id !== id) {
          throw new ConflictException(
            `Email ${updateUserInput.email} is already in use`,
          );
        }
      }
      const { roleIds, ...userData } = updateUserInput;
      const update: Partial<UserEntity> = {};
      if (userData.email !== undefined) update.email = userData.email;
      if (userData.name !== undefined) update.name = userData.name;
      await this.users.update({ id }, update);
      if (roleIds) {
        const foundRoles = await this.roles.find({ where: { id: In(roleIds) } });
        const updated = await this.users.findOne({ where: { id } });
        if (updated) {
          updated.roles = foundRoles;
          await this.users.save(updated);
        }
      }
      return await this.findOne(id);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      if (error instanceof QueryFailedError) {
        const driver = (error as QueryFailedError & { driverError?: { code?: string } })
          .driverError;
        if (driver?.code === '23505') {
          throw new ConflictException(
            `Email ${updateUserInput.email} is already in use`,
          );
        }
      }
      this.logger.error('Failed to update user', error as Error);
      throw new InternalServerErrorException('Failed to update user');
    }
  }

  async remove(id: number): Promise<UserEntity> {
    try {
      const user = await this.findOne(id);
      await this.users.delete({ id });
      return user;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Failed to delete user', error as Error);
      throw new InternalServerErrorException('Failed to delete user');
    }
  }
}
