import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { RoleEntity, UserEntity } from '@swiftship/platform-typeorm';
import { UsersService } from './users.service';
import { CreateUserInput } from './dto/create-user.input';
import { UpdateUserInput } from './dto/update-user.input';

describe('UsersService', () => {
  let service: UsersService;
  let usersRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock; update: jest.Mock; delete: jest.Mock };
  let rolesRepo: { find: jest.Mock };

  const mockUsersRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockRolesRepo = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(UserEntity), useValue: mockUsersRepo },
        { provide: getRepositoryToken(RoleEntity), useValue: mockRolesRepo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    usersRepo = mockUsersRepo;
    rolesRepo = mockRolesRepo;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createUserInput: CreateUserInput = {
      email: 'test@example.com',
      name: 'Test User',
    };

    const mockUser = {
      id: 1,
      email: createUserInput.email,
      name: createUserInput.name,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create a new user successfully', async () => {
      mockUsersRepo.create.mockReturnValue(mockUser);
      mockUsersRepo.save.mockResolvedValue(mockUser);

      const result = await service.create(createUserInput);

      expect(result).toEqual(mockUser);
      expect(mockUsersRepo.create).toHaveBeenCalledWith({
        email: createUserInput.email,
        name: createUserInput.name,
      });
      expect(mockUsersRepo.save).toHaveBeenCalledWith(mockUser);
    });

    it('should throw ConflictException if email already exists (PG 23505)', async () => {
      const pgError = new QueryFailedError(
        'insert into "users"',
        [],
        new Error('duplicate key value violates unique constraint'),
      );
      (pgError as unknown as { driverError: { code: string } }).driverError = {
        code: '23505',
      };
      mockUsersRepo.create.mockReturnValue(mockUser);
      mockUsersRepo.save.mockRejectedValue(pgError);

      await expect(service.create(createUserInput)).rejects.toThrow(ConflictException);
      expect(mockUsersRepo.save).toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException for other errors', async () => {
      mockUsersRepo.create.mockReturnValue(mockUser);
      mockUsersRepo.save.mockRejectedValue(new Error('Database error'));

      await expect(service.create(createUserInput)).rejects.toThrow(InternalServerErrorException);
      expect(mockUsersRepo.save).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    const mockUsers = [
      {
        id: 1,
        email: 'user1@example.com',
        name: 'User 1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        email: 'user2@example.com',
        name: 'User 2',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should return an array of users', async () => {
      mockUsersRepo.find.mockResolvedValue(mockUsers);

      const result = await service.findAll();

      expect(result).toEqual(mockUsers);
      expect(mockUsersRepo.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      });
    });

    it('should throw InternalServerErrorException if database query fails', async () => {
      mockUsersRepo.find.mockRejectedValue(new Error('Database error'));

      await expect(service.findAll()).rejects.toThrow(InternalServerErrorException);
      expect(mockUsersRepo.find).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    const userId = 1;
    const mockUser = {
      id: userId,
      email: 'user@example.com',
      name: 'User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return a user if it exists', async () => {
      mockUsersRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne(userId);

      expect(result).toEqual(mockUser);
      expect(mockUsersRepo.findOne).toHaveBeenCalledWith({ where: { id: userId } });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(userId)).rejects.toThrow(NotFoundException);
      expect(mockUsersRepo.findOne).toHaveBeenCalledWith({ where: { id: userId } });
    });

    it('should throw InternalServerErrorException if database query fails', async () => {
      mockUsersRepo.findOne.mockRejectedValue(new Error('Database error'));

      await expect(service.findOne(userId)).rejects.toThrow(InternalServerErrorException);
      expect(mockUsersRepo.findOne).toHaveBeenCalled();
    });
  });

  describe('findByEmail', () => {
    const userEmail = 'user@example.com';
    const mockUser = {
      id: 1,
      email: userEmail,
      name: 'User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return a user if it exists', async () => {
      mockUsersRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail(userEmail);

      expect(result).toEqual(mockUser);
      expect(mockUsersRepo.findOne).toHaveBeenCalledWith({ where: { email: userEmail } });
    });

    it('should return null if user does not exist', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      const result = await service.findByEmail(userEmail);

      expect(result).toBeNull();
      expect(mockUsersRepo.findOne).toHaveBeenCalledWith({ where: { email: userEmail } });
    });

    it('should throw InternalServerErrorException if database query fails', async () => {
      mockUsersRepo.findOne.mockRejectedValue(new Error('Database error'));

      await expect(service.findByEmail(userEmail)).rejects.toThrow(InternalServerErrorException);
      expect(mockUsersRepo.findOne).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const userId = 1;
    const updateUserInput: UpdateUserInput = {
      id: userId,
      name: 'Updated User',
    };

    const mockUser = {
      id: userId,
      email: 'user@example.com',
      name: 'User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockUpdatedUser = {
      ...mockUser,
      name: updateUserInput.name,
    };

    it('should update a user successfully', async () => {
      mockUsersRepo.findOne
        .mockResolvedValueOnce(mockUser) // first call: findOne(id) verifies user exists
        .mockResolvedValueOnce(mockUpdatedUser); // final call: findOne(id) returns the updated row
      mockUsersRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.update(userId, updateUserInput);

      expect(result).toEqual(mockUpdatedUser);
      expect(mockUsersRepo.findOne).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockUsersRepo.update).toHaveBeenCalledWith(
        { id: userId },
        { name: updateUserInput.name },
      );
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.update(userId, updateUserInput)).rejects.toThrow(NotFoundException);
      expect(mockUsersRepo.update).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if updating to an email that is already in use', async () => {
      const updateWithEmail: UpdateUserInput = {
        id: userId,
        email: 'existing@example.com',
      };

      const existingUser = {
        id: 2,
        email: 'existing@example.com',
        name: 'Existing User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUsersRepo.findOne
        .mockResolvedValueOnce(mockUser) // First call to verify user exists
        .mockResolvedValueOnce(existingUser); // Second call to check email

      await expect(service.update(userId, updateWithEmail)).rejects.toThrow(ConflictException);
      expect(mockUsersRepo.update).not.toHaveBeenCalled();
    });

    it('should allow updating to the same email', async () => {
      const updateWithSameEmail: UpdateUserInput = {
        id: userId,
        email: 'user@example.com', // Same as current
      };

      const sameUser = {
        id: userId,
        email: 'user@example.com',
        name: 'User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUsersRepo.findOne
        .mockResolvedValueOnce(mockUser) // First call to verify user exists
        .mockResolvedValueOnce(sameUser) // Second call to check email
        .mockResolvedValueOnce(mockUser); // Final call: return the updated row
      mockUsersRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.update(userId, updateWithSameEmail);

      expect(result).toEqual(mockUser);
      expect(mockUsersRepo.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    const userId = 1;
    const mockUser = {
      id: userId,
      email: 'user@example.com',
      name: 'User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should delete a user successfully', async () => {
      mockUsersRepo.findOne.mockResolvedValue(mockUser);
      mockUsersRepo.delete.mockResolvedValue({ affected: 1 });

      const result = await service.remove(userId);

      expect(result).toEqual(mockUser);
      expect(mockUsersRepo.findOne).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockUsersRepo.delete).toHaveBeenCalledWith({ id: userId });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(userId)).rejects.toThrow(NotFoundException);
      expect(mockUsersRepo.delete).not.toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException if database delete fails', async () => {
      mockUsersRepo.findOne.mockResolvedValue(mockUser);
      mockUsersRepo.delete.mockRejectedValue(new Error('Database error'));

      await expect(service.remove(userId)).rejects.toThrow(InternalServerErrorException);
      expect(mockUsersRepo.findOne).toHaveBeenCalled();
      expect(mockUsersRepo.delete).toHaveBeenCalled();
    });
  });
});
