import { AuditLogService } from './audit-log.service';

/**
 * Build a chainable query-builder mock that records every method call
 * and returns the chain itself for fluent chaining. Mirrors the surface
 * of TypeORM's `SelectQueryBuilder` that `AuditLogService` actually uses.
 */
function makeQueryBuilderMock() {
  const calls: Record<string, unknown[]> = {
    andWhere: [],
    where: [],
    orderBy: [],
    take: [],
    skip: [],
    getMany: [],
  };
  const qb: any = {};
  for (const k of Object.keys(calls)) {
    qb[k] = jest.fn((...args: unknown[]) => {
      calls[k].push(args);
      return qb;
    });
  }
  return { qb, calls };
}

describe('AuditLogService (SS-028)', () => {
  it('record() writes via the repository', async () => {
    const repo = {
      create: jest.fn((x: any) => ({ id: 'row-1', ...x })),
      save: jest.fn(async (x: any) => ({ id: 'row-1', ...x })),
      createQueryBuilder: jest.fn(),
    };
    const svc = new AuditLogService(repo as any);
    const row = await svc.record({
      tenantId: '1',
      action: 'order.create',
      resourceType: 'order',
      actorType: 'user',
    } as any);
    expect(row?.id).toBe('row-1');
    expect(repo.create).toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalled();
  });

  it('record() swallows errors and warns instead of crashing the call', async () => {
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const repo = {
      create: jest.fn((x: any) => x),
      save: jest.fn(async () => {
        throw new Error('audit table missing');
      }),
      createQueryBuilder: jest.fn(),
    };
    const svc = new AuditLogService(repo as any);
    const result = await svc.record({
      tenantId: '1',
      action: 'order.create',
      resourceType: 'order',
      actorType: 'system',
    } as any);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('query() builds the where clause from the filter', async () => {
    const { qb, calls } = makeQueryBuilderMock();
    qb.getMany.mockResolvedValue([]);
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    const svc = new AuditLogService(repo as any);
    await svc.query({
      tenantId: '9',
      resourceType: 'order',
      limit: 10,
      offset: 0,
    } as any);
    expect(repo.createQueryBuilder).toHaveBeenCalledWith('a');
    expect(calls.andWhere.length).toBeGreaterThanOrEqual(2);
    expect(calls.andWhere[0]).toEqual([
      'a.tenantId = :tenantId',
      { tenantId: 9 },
    ]);
    expect(qb.orderBy).toHaveBeenCalledWith('a.createdAt', 'DESC');
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.getMany).toHaveBeenCalled();
  });

  it('getForResource() caps at 200 newest-first', async () => {
    const { qb, calls } = makeQueryBuilderMock();
    qb.getMany.mockResolvedValue([]);
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    const svc = new AuditLogService(repo as any);
    await svc.getForResource('1', 'order', 'o-1');
    expect(repo.createQueryBuilder).toHaveBeenCalledWith('a');
    expect(calls.andWhere[0]).toEqual([
      'a.tenantId = :tenantId',
      { tenantId: 1 },
    ]);
    expect(calls.andWhere).toContainEqual([
      'a.resourceType = :resourceType',
      { resourceType: 'order' },
    ]);
    expect(calls.andWhere).toContainEqual([
      'a.resourceId = :resourceId',
      { resourceId: 'o-1' },
    ]);
    expect(qb.take).toHaveBeenCalledWith(200);
    expect(qb.getMany).toHaveBeenCalled();
  });
});
