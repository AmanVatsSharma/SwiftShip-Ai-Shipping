import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserInput } from './dto/create-user.input';
import { UpdateUserInput } from './dto/update-user.input';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

describe('UsersService', () => {
  let service: UsersService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    user: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prismaService = module.get<PrismaService>(PrismaService);
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
      ...createUserInput,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create a new user successfully', async () => {
      mockPrismaService.user.create.mockResolvedValue(mockUser);

      const result = await service.create(createUserInput);

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: createUserInput,
      });
    });

    it('should throw ConflictException if email already exists', async () => {
      const prismaError = new PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`email`)',
        {
          code: 'P2002',
          clientVersion: '4.5.0',
          meta: { target: ['email'] }
        }
      );

      mockPrismaService.user.create.mockRejectedValue(prismaError);

      await expect(service.create(createUserInput)).rejects.toThrow(ConflictException);
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: createUserInput,
      });
    });

    it('should throw InternalServerErrorException for other errors', async () => {
      mockPrismaService.user.create.mockRejectedValue(new Error('Database error'));

      await expect(service.create(createUserInput)).rejects.toThrow(InternalServerErrorException);
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: createUserInput,
      });
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
      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);

      const result = await service.findAll();

      expect(result).toEqual(mockUsers);
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' }
      });
    });

    it('should throw InternalServerErrorException if database query fails', async () => {
      mockPrismaService.user.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.findAll()).rejects.toThrow(InternalServerErrorException);
      expect(mockPrismaService.user.findMany).toHaveBeenCalled();
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
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOne(userId);

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne(userId)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
      });
    });

    it('should throw InternalServerErrorException if database query fails', async () => {
      mockPrismaService.user.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(service.findOne(userId)).rejects.toThrow(InternalServerErrorException);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
      });
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
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findByEmail(userEmail);

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: userEmail },
      });
    });

    it('should return null if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.findByEmail(userEmail);

      expect(result).toBeNull();
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: userEmail },
      });
    });

    it('should throw InternalServerErrorException if database query fails', async () => {
      mockPrismaService.user.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(service.findByEmail(userEmail)).rejects.toThrow(InternalServerErrorException);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: userEmail },
      });
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
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrismaService.user.update.mockResolvedValue(mockUpdatedUser);

      const result = await service.update(userId, updateUserInput);

      expect(result).toEqual(mockUpdatedUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          email: updateUserInput.email,
          name: updateUserInput.name,
        },
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.update(userId, updateUserInput)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
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

      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(mockUser) // First call to verify user exists
        .mockResolvedValueOnce(existingUser); // Second call to check email

      await expect(service.update(userId, updateWithEmail)).rejects.toThrow(ConflictException);
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
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

      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(mockUser) // First call to verify user exists
        .mockResolvedValueOnce(sameUser); // Second call to check email

      mockPrismaService.user.update.mockResolvedValue(mockUser);

      const result = await service.update(userId, updateWithSameEmail);

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.update).toHaveBeenCalled();
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
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.delete.mockResolvedValue(mockUser);

      const result = await service.remove(userId);

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(mockPrismaService.user.delete).toHaveBeenCalledWith({
        where: { id: userId },
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.remove(userId)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.user.delete).not.toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException if database delete fails', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.delete.mockRejectedValue(new Error('Database error'));

      await expect(service.remove(userId)).rejects.toThrow(InternalServerErrorException);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(mockPrismaService.user.delete).toHaveBeenCalledWith({
        where: { id: userId },
      });
    });
  });
}); 