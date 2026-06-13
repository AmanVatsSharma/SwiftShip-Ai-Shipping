import { Test, TestingModule } from '@nestjs/testing';
import { UsersResolver } from './users.resolver';
import { UsersService } from './users.service';
import { CreateUserInput } from './dto/create-user.input';
import { UpdateUserInput } from './dto/update-user.input';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('UsersResolver', () => {
  let resolver: UsersResolver;
  let usersService: UsersService;

  const mockUsersService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersResolver,
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    resolver = module.get<UsersResolver>(UsersResolver);
    usersService = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  describe('createUser', () => {
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

    it('should create a user successfully', async () => {
      mockUsersService.create.mockResolvedValue(mockUser);

      const result = await resolver.createUser(createUserInput);

      expect(result).toEqual(mockUser);
      expect(mockUsersService.create).toHaveBeenCalledWith(createUserInput);
    });

    it('should pass through exceptions from the service', async () => {
      mockUsersService.create.mockRejectedValue(
        new ConflictException(`User with email ${createUserInput.email} already exists`)
      );

      await expect(resolver.createUser(createUserInput)).rejects.toThrow(ConflictException);
      expect(mockUsersService.create).toHaveBeenCalledWith(createUserInput);
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
      mockUsersService.findAll.mockResolvedValue(mockUsers);

      const result = await resolver.findAll();

      expect(result).toEqual(mockUsers);
      expect(mockUsersService.findAll).toHaveBeenCalled();
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
      mockUsersService.findOne.mockResolvedValue(mockUser);

      const result = await resolver.findOne(userId);

      expect(result).toEqual(mockUser);
      expect(mockUsersService.findOne).toHaveBeenCalledWith(userId);
    });

    it('should pass through NotFoundException if user does not exist', async () => {
      mockUsersService.findOne.mockRejectedValue(
        new NotFoundException(`User with ID ${userId} not found`)
      );

      await expect(resolver.findOne(userId)).rejects.toThrow(NotFoundException);
      expect(mockUsersService.findOne).toHaveBeenCalledWith(userId);
    });
  });

  describe('updateUser', () => {
    const updateUserInput: UpdateUserInput = {
      id: 1,
      name: 'Updated User',
    };

    const mockUser = {
      id: updateUserInput.id,
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
      mockUsersService.update.mockResolvedValue(mockUpdatedUser);

      const result = await resolver.updateUser(updateUserInput);

      expect(result).toEqual(mockUpdatedUser);
      expect(mockUsersService.update).toHaveBeenCalledWith(updateUserInput.id, updateUserInput);
    });

    it('should pass through NotFoundException if user does not exist', async () => {
      mockUsersService.update.mockRejectedValue(
        new NotFoundException(`User with ID ${updateUserInput.id} not found`)
      );

      await expect(resolver.updateUser(updateUserInput)).rejects.toThrow(NotFoundException);
      expect(mockUsersService.update).toHaveBeenCalledWith(updateUserInput.id, updateUserInput);
    });

    it('should pass through ConflictException if email is already in use', async () => {
      const updateWithEmail: UpdateUserInput = {
        id: 1,
        email: 'existing@example.com',
      };

      mockUsersService.update.mockRejectedValue(
        new ConflictException(`Email ${updateWithEmail.email} is already in use`)
      );

      await expect(resolver.updateUser(updateWithEmail)).rejects.toThrow(ConflictException);
      expect(mockUsersService.update).toHaveBeenCalledWith(updateWithEmail.id, updateWithEmail);
    });
  });

  describe('removeUser', () => {
    const userId = 1;
    const mockUser = {
      id: userId,
      email: 'user@example.com',
      name: 'User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should remove a user successfully', async () => {
      mockUsersService.remove.mockResolvedValue(mockUser);

      const result = await resolver.removeUser(userId);

      expect(result).toEqual(mockUser);
      expect(mockUsersService.remove).toHaveBeenCalledWith(userId);
    });

    it('should pass through NotFoundException if user does not exist', async () => {
      mockUsersService.remove.mockRejectedValue(
        new NotFoundException(`User with ID ${userId} not found`)
      );

      await expect(resolver.removeUser(userId)).rejects.toThrow(NotFoundException);
      expect(mockUsersService.remove).toHaveBeenCalledWith(userId);
    });
  });
}); 