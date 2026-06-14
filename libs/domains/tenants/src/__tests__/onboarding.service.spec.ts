import { ConflictException, BadRequestException } from '@nestjs/common';
import { OnboardingService } from '../onboarding.service';
import { ApiKeyService } from '../api-key.service';
import { TenantFeatureFlagService } from '../tenant-feature-flag.service';
import type {
  TenantApiKeyEntity,
  TenantEntity,
  TenantMemberEntity,
} from '../entities';
import type { InviteEntity } from '../invite.entity';
import type { UserEntity } from '@swiftship/platform-typeorm';

describe('OnboardingService', () => {
  const makeTenantRepo = () => {
    const items: TenantEntity[] = [];
    let nextId = 1;
    return {
      create: jest.fn((data: Partial<TenantEntity>) => ({ id: nextId, ...data } as TenantEntity)),
      save: jest.fn(async (entity: TenantEntity) => {
        if (!entity.id) entity.id = nextId++;
        const idx = items.findIndex((i) => i.id === entity.id);
        if (idx >= 0) items[idx] = entity;
        else items.push(entity);
        return entity;
      }),
      findOne: jest.fn(async ({ where }: { where: Partial<TenantEntity> }) => {
        return (
          items.find(
            (t) =>
              (where.id !== undefined && t.id === where.id) ||
              (where.slug !== undefined && t.slug === where.slug),
          ) ?? null
        );
      }),
      _items: items,
    };
  };

  const makeUserRepo = () => {
    const items: UserEntity[] = [];
    let nextId = 1;
    return {
      create: jest.fn((data: Partial<UserEntity>) => ({ id: nextId, ...data } as UserEntity)),
      save: jest.fn(async (entity: UserEntity) => {
        if (!entity.id) entity.id = nextId++;
        const idx = items.findIndex((i) => i.id === entity.id);
        if (idx >= 0) items[idx] = entity;
        else items.push(entity);
        return entity;
      }),
      _items: items,
    };
  };

  const makeApiKeyRepo = () => {
    const items: TenantApiKeyEntity[] = [];
    let nextId = 1;
    return {
      create: jest.fn((data: Partial<TenantApiKeyEntity>) => ({ id: nextId, ...data } as TenantApiKeyEntity)),
      save: jest.fn(async (entity: TenantApiKeyEntity) => {
        if (!entity.id) entity.id = nextId++;
        const idx = items.findIndex((i) => i.id === entity.id);
        if (idx >= 0) items[idx] = entity;
        else items.push(entity);
        return entity;
      }),
      _items: items,
    };
  };

  const makeInviteRepo = () => {
    const items: InviteEntity[] = [];
    let nextId = 1;
    const memberItems: TenantMemberEntity[] = [];
    let memberNextId = 1;
    return {
      create: jest.fn((data: Partial<InviteEntity>) => ({ id: nextId, ...data } as InviteEntity)),
      save: jest.fn(async (entity: InviteEntity | TenantMemberEntity) => {
        const isInvite = (entity as InviteEntity).token !== undefined;
        if (isInvite) {
          const e = entity as InviteEntity;
          if (!e.id) e.id = nextId++;
          const idx = items.findIndex((i) => i.id === e.id);
          if (idx >= 0) items[idx] = e;
          else items.push(e);
          return e;
        } else {
          const e = entity as TenantMemberEntity;
          if (!e.id) e.id = memberNextId++;
          const idx = memberItems.findIndex((i) => i.id === e.id);
          if (idx >= 0) memberItems[idx] = e;
          else memberItems.push(e);
          return e;
        }
      }),
      findOne: jest.fn(async ({ where }: { where: Partial<InviteEntity> }) => {
        return (
          items.find(
            (i) =>
              (where.token !== undefined && i.token === where.token) ||
              (where.id !== undefined && i.id === where.id),
          ) ?? null
        );
      }),
      manager: {
        create: jest.fn((_cls: any, data: any) => data),
        save: jest.fn(async (_cls: any, entity: TenantMemberEntity) => {
          if (!entity.id) entity.id = memberNextId++;
          const idx = memberItems.findIndex((i) => i.id === entity.id);
          if (idx >= 0) memberItems[idx] = entity;
          else memberItems.push(entity);
          return entity;
        }),
      },
      _items: items,
      _memberItems: memberItems,
    };
  };

  const makeApiKeyService = () => {
    let nextId = 1;
    return {
      create: jest.fn(async (tenantId: number) => {
        const prefix = `ss_live_${tenantId}${nextId}`.padEnd(8 + 'ss_live_'.length, 'x').slice(0, 'ss_live_'.length + 8);
        const entity: TenantApiKeyEntity = {
          id: nextId++,
          tenantId,
          prefix,
          hashedKey: `hashed-${tenantId}-${nextId}`,
          isActive: true,
          lastUsedAt: null,
          createdAt: new Date(),
        };
        return { entity, plainText: `${prefix}_plain` };
      }),
      rotate: jest.fn(async (oldKeyId: number) => {
        const prefix = `ss_live_rot`;
        const entity: TenantApiKeyEntity = {
          id: oldKeyId + 100,
          tenantId: 1,
          prefix,
          hashedKey: `hashed-rotated-${oldKeyId}`,
          isActive: true,
          lastUsedAt: null,
          createdAt: new Date(),
        };
        return { entity, plainText: `${prefix}_plain`, prefix };
      }),
    };
  };

  const makeFeatureFlagService = () => ({
    flag: jest.fn(),
    setFlag: jest.fn(),
    clear: jest.fn(),
  });

  const makeWalletService = () => ({
    topUp: jest.fn(async () => ({ id: 1, tenantId: 1, availableBalance: 50000 })),
  });

  const buildService = () => {
    const tenants = makeTenantRepo();
    const users = makeUserRepo();
    const apiKeys = makeApiKeyRepo();
    const invites = makeInviteRepo();
    const apiKeyService = makeApiKeyService() as unknown as ApiKeyService;
    const featureFlagService =
      makeFeatureFlagService() as unknown as TenantFeatureFlagService;
    const walletService = makeWalletService() as any;

    const service = new OnboardingService(
      tenants as any,
      invites as any,
      users as any,
      apiKeys as any,
      apiKeyService,
      featureFlagService,
      walletService,
    );

    return {
      service,
      tenants,
      users,
      apiKeys,
      invites,
      apiKeyService,
      featureFlagService,
      walletService,
    };
  };

  describe('onboardTenant', () => {
    it('creates tenant + user + api key with free credit, returns plainText once', async () => {
      const { service, tenants, users, apiKeyService, featureFlagService, walletService } =
        buildService();

      const result = await service.onboardTenant({
        name: 'Acme Co',
        email: 'founder@acme.test',
        password: 'hunter22',
      });

      // Tenant created
      expect(tenants._items).toHaveLength(1);
      const tenant = tenants._items[0];
      expect(tenant.slug).toBe('acme-co');
      expect(tenant.status).toBe('TRIAL');
      expect(tenant.tier).toBe('STARTER');

      // User created
      expect(users._items).toHaveLength(1);
      const user = users._items[0];
      expect(user.email).toBe('founder@acme.test');
      expect(user.password).toBeDefined();
      expect(user.emailVerified).toBe(true);

      // API key returned ONCE
      expect(result.apiKey.plainText).toMatch(/^ss_live_/);
      expect(result.apiKey.prefix).toMatch(/^ss_live_/);
      expect(apiKeyService.create).toHaveBeenCalledWith(tenant.id);

      // Default flags set
      const flags = service.getDefaultFeatureFlags();
      expect(flags.multiWarehouse).toBe(true);
      expect(flags.codRemittance).toBe(true);
      expect(flags.brandedTracking).toBe(false);
      expect(flags.whatsappNotifications).toBe(false);
      expect(flags.advancedRateShopping).toBe(true);
      for (const [key, value] of Object.entries(flags)) {
        expect(featureFlagService.setFlag).toHaveBeenCalledWith(
          tenant.id,
          key,
          value,
        );
      }

      // Free credit granted via wallet
      expect(walletService.topUp).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: tenant.id,
          amount: 50000,
          idempotencyKey: `onboarding:free-credit:${tenant.id}`,
        }),
      );
    });

    it('is idempotent on slug — second call rejects', async () => {
      const { service } = buildService();
      await service.onboardTenant({
        name: 'Acme Co',
        email: 'founder@acme.test',
        password: 'hunter22',
      });

      await expect(
        service.onboardTenant({
          name: 'Acme Co',
          email: 'other@acme.test',
          password: 'hunter22',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('inviteTeamMember', () => {
    it('generates token, sets expiresAt, logs the would-be email', async () => {
      const { service, invites } = buildService();

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        const invite = await service.inviteTeamMember({
          tenantId: 1,
          email: 'invitee@acme.test',
          role: 'MEMBER',
        });
        expect(invite.token).toBeDefined();
        expect(invite.token.length).toBeGreaterThan(20);
        expect(invite.expiresAt).toBeInstanceOf(Date);
        expect(invite.expiresAt.getTime()).toBeGreaterThan(Date.now());
        expect(invite.acceptedAt).toBeNull();
        expect(invites._items).toHaveLength(1);
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('Would email invite link'),
        );
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('invitee@acme.test'),
        );
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  describe('acceptInvite', () => {
    it('creates a tenant member and marks the invite accepted', async () => {
      const { service, invites } = buildService();

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        const invite = await service.inviteTeamMember({
          tenantId: 7,
          email: 'member@acme.test',
          role: 'ADMIN',
        });

        const member = await service.acceptInvite(invite.token, 42);
        expect(member.tenantId).toBe(7);
        expect(member.userId).toBe(42);
        expect(member.role).toBe('ADMIN');
        expect(member.isPrimary).toBe(false);
        expect(invites._items[0].acceptedAt).toBeInstanceOf(Date);
      } finally {
        logSpy.mockRestore();
      }
    });

    it('rejects expired / already-accepted invite', async () => {
      const { service, invites } = buildService();
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        const invite = await service.inviteTeamMember({
          tenantId: 7,
          email: 'member@acme.test',
          role: 'MEMBER',
        });

        // Mark as expired
        invite.expiresAt = new Date(Date.now() - 1000);
        await invites.save(invite);

        await expect(service.acceptInvite(invite.token, 42)).rejects.toThrow(
          BadRequestException,
        );
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  describe('rotateApiKey', () => {
    it('revokes old key, returns new key with same prefix', async () => {
      const { service, apiKeyService } = buildService();
      const result = await service.rotateApiKey(11);
      expect(apiKeyService.rotate).toHaveBeenCalledWith(11);
      expect(result.prefix).toBe('ss_live_rot');
      expect(result.plainText).toMatch(/^ss_live_/);
    });
  });

  describe('createSubAccount', () => {
    it('creates a child tenant with parentTenantId in settings', async () => {
      const { service, tenants, apiKeyService } = buildService();
      const child = await service.createSubAccount(1, {
        name: 'Acme Brand',
        email: 'brand@acme.test',
      });
      expect(child.slug).toBe('acme-brand');
      expect(child.tier).toBe('STARTER');
      expect(child.status).toBe('TRIAL');
      expect((child.settings as any).parentTenantId).toBe(1);
      expect(apiKeyService.create).toHaveBeenCalledWith(child.id);
      expect(tenants._items).toHaveLength(1);
    });
  });
});
