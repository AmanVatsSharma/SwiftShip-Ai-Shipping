import { NotFoundException } from '@nestjs/common';
import { TenantService } from '../lib/tenant.service';
import type { TenantEntity } from '../lib/entities';

describe('TenantService', () => {
  const makeRepo = () => {
    const items: TenantEntity[] = [];
    let nextId = 1;
    return {
      create: jest.fn((data: Partial<TenantEntity>) => {
        const t = { id: nextId, ...data } as TenantEntity;
        return t;
      }),
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
            (i) =>
              (where.id !== undefined && i.id === where.id) ||
              (where.slug !== undefined && i.slug === where.slug),
          ) ?? null
        );
      }),
      createQueryBuilder: jest.fn(() => {
        const filters: Array<(q: TenantEntity) => boolean> = [];
        const order: { col: keyof TenantEntity; dir: 'ASC' | 'DESC' } = {
          col: 'createdAt',
          dir: 'DESC',
        };
        const takeN = { v: undefined as number | undefined };
        const skipN = { v: undefined as number | undefined };
        const qb = {
          andWhere(pred: string, params: Record<string, unknown>) {
            if (pred.includes('status')) {
              filters.push((t) => t.status === params.status);
            } else if (pred.includes('tier')) {
              filters.push((t) => t.tier === params.tier);
            } else if (pred.includes('ILIKE')) {
              const s = String(params.s);
              filters.push(
                (t) =>
                  t.name.includes(s.replace(/%/g, '')) ||
                  t.slug.includes(s.replace(/%/g, '')),
              );
            }
            return qb;
          },
          orderBy(col: keyof TenantEntity, dir: 'ASC' | 'DESC') {
            order.col = col;
            order.dir = dir;
            return qb;
          },
          take(n: number) {
            takeN.v = n;
            return qb;
          },
          skip(n: number) {
            skipN.v = n;
            return qb;
          },
          async getMany() {
            const result = items.filter((t) => filters.every((f) => f(t)));
            const sorted = [...result].sort((a, b) => {
              const av = a[order.col] as unknown as string;
              const bv = b[order.col] as unknown as string;
              if (av < bv) return order.dir === 'ASC' ? -1 : 1;
              if (av > bv) return order.dir === 'ASC' ? 1 : -1;
              return 0;
            });
            const start = skipN.v ?? 0;
            const end = takeN.v !== undefined ? start + takeN.v : undefined;
            return sorted.slice(start, end);
          },
        };
        return qb;
      }),
      _items: items,
    };
  };

  it('creates → finds by id → finds by slug → suspends', async () => {
    const repo = makeRepo() as never;
    const service = new TenantService(repo);

    const created = await service.create({
      slug: 'acme',
      name: 'Acme',
      tier: 'GROWTH',
    });
    expect(created.slug).toBe('acme');
    expect(created.status).toBe('TRIAL');

    const byId = await service.findById(created.id);
    expect(byId.id).toBe(created.id);

    const bySlug = await service.findBySlug('acme');
    expect(bySlug?.id).toBe(created.id);

    const suspended = await service.suspend(created.id);
    expect(suspended.status).toBe('SUSPENDED');

    await expect(service.findById).rejects.toThrow(NotFoundException);
  });
});
