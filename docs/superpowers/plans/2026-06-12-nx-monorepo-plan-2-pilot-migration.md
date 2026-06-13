# Plan 2: Pilot Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate 3 low-risk domains (warehouses, notifications, serviceability) to the new Nx library structure to validate the migration approach before bulk migration.

**Architecture:** Each domain gets 4 libraries (types, data-access, api, ui). Code is moved atomically, imports updated, tests validated, old code deleted. This plan proves the pattern works before applying to 17+ more domains.

**Tech Stack:** Nx generators, NestJS, Prisma, GraphQL, React

---

## Task 1: Migrate Warehouses Domain - Types

**Files:**
- Create: `libs/domains/warehouses/types/src/lib/warehouse.model.ts`
- Create: `libs/domains/warehouses/types/src/lib/dto/create-warehouse.input.ts`
- Create: `libs/domains/warehouses/types/src/lib/dto/update-warehouse.input.ts`
- Create: `libs/domains/warehouses/types/src/index.ts`
- Delete: `src/warehouses/warehouses.model.ts`
- Delete: `src/warehouses/dto/*.ts`

- [ ] **Step 1: Create types library**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
npx nx g @nx/node:lib libs/domains/warehouses/types \
  --name=types \
  --directory=libs/domains/warehouses/types
```

- [ ] **Step 2: Add tags to project.json**

Edit `libs/domains/warehouses/types/project.json`, add tags:

```json
{
  "tags": ["domain:warehouses", "layer:types", "scope:shared", "team:fulfillment", "maturity:stable", "type:types"]
}
```

- [ ] **Step 3: Read original model file**

```bash
cat src/warehouses/warehouses.model.ts
```

- [ ] **Step 4: Create warehouse model**

Create `libs/domains/warehouses/types/src/lib/warehouse.model.ts`:

```typescript
import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class Warehouse {
  @Field(() => Int)
  id!: number;

  @Field()
  name!: string;

  @Field()
  address!: string;

  @Field()
  city!: string;

  @Field()
  state!: string;

  @Field()
  pincode!: string;

  @Field(() => Float)
  latitude!: number;

  @Field(() => Float)
  longitude!: number;

  @Field()
  isActive!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
```

- [ ] **Step 5: Create DTOs**

Create `libs/domains/warehouses/types/src/lib/dto/create-warehouse.input.ts`:

```typescript
import { InputType, Field, Float } from '@nestjs/graphql';
import { IsString, IsNumber, IsBoolean, IsOptional } from 'class-validator';

@InputType()
export class CreateWarehouseInput {
  @Field()
  @IsString()
  name!: string;

  @Field()
  @IsString()
  address!: string;

  @Field()
  @IsString()
  city!: string;

  @Field()
  @IsString()
  state!: string;

  @Field()
  @IsString()
  pincode!: string;

  @Field(() => Float)
  @IsNumber()
  latitude!: number;

  @Field(() => Float)
  @IsNumber()
  longitude!: number;

  @Field({ nullable: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
```

Create `libs/domains/warehouses/types/src/lib/dto/update-warehouse.input.ts`:

```typescript
import { InputType, Field, PartialType } from '@nestjs/graphql';
import { CreateWarehouseInput } from './create-warehouse.input';

@InputType()
export class UpdateWarehouseInput extends PartialType(CreateWarehouseInput) {}
```

- [ ] **Step 6: Export from index**

Edit `libs/domains/warehouses/types/src/index.ts`:

```typescript
export * from './lib/warehouse.model';
export * from './lib/dto/create-warehouse.input';
export * from './lib/dto/update-warehouse.input';
```

- [ ] **Step 7: Build types library**

```bash
npx nx build warehouses-types
```

Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add libs/domains/warehouses/types
git commit -m "feat(warehouses): migrate types to Nx library"
```

---

## Task 2: Migrate Warehouses Domain - Data Access

**Files:**
- Create: `libs/domains/warehouses/data-access/src/lib/warehouse.repository.ts`
- Create: `libs/domains/warehouses/data-access/src/index.ts`

- [ ] **Step 1: Create data-access library**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
npx nx g @nx/node:lib libs/domains/warehouses/data-access \
  --name=data-access \
  --directory=libs/domains/warehouses/data-access
```

- [ ] **Step 2: Add tags**

Edit `libs/domains/warehouses/data-access/project.json`:

```json
{
  "tags": ["domain:warehouses", "layer:data-access", "scope:api", "team:fulfillment", "maturity:stable", "type:feature"]
}
```

- [ ] **Step 3: Update tsconfig.json to allow Prisma**

Edit `libs/domains/warehouses/data-access/tsconfig.json`, add to compilerOptions:

```json
{
  "compilerOptions": {
    "paths": {
      "@swiftship/platform/prisma": ["libs/platform/prisma/src/index.ts"]
    }
  }
}
```

- [ ] **Step 4: Read original repository code**

```bash
cat src/warehouses/warehouses.repository.ts 2>/dev/null || echo "No repository file - creating new"
```

- [ ] **Step 5: Create repository**

Create `libs/domains/warehouses/data-access/src/lib/warehouse.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@swiftship/platform/prisma';
import { CreateWarehouseInput, UpdateWarehouseInput } from '@swiftship/domains/warehouses/types';

@Injectable()
export class WarehouseRepository {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.warehouse.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: number) {
    return this.prisma.warehouse.findUnique({
      where: { id },
    });
  }

  async findActive() {
    return this.prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(data: CreateWarehouseInput) {
    return this.prisma.warehouse.create({
      data,
    });
  }

  async update(id: number, data: UpdateWarehouseInput) {
    return this.prisma.warehouse.update({
      where: { id },
      data,
    });
  }

  async delete(id: number) {
    return this.prisma.warehouse.delete({
      where: { id },
    });
  }
}
```

- [ ] **Step 6: Export from index**

Edit `libs/domains/warehouses/data-access/src/index.ts`:

```typescript
export * from './lib/warehouse.repository';
```

- [ ] **Step 7: Commit**

```bash
git add libs/domains/warehouses/data-access
git commit -m "feat(warehouses): migrate data-access to Nx library"
```

---

## Task 3: Migrate Warehouses Domain - API

**Files:**
- Create: `libs/domains/warehouses/api/src/lib/warehouses.resolver.ts`
- Create: `libs/domains/warehouses/api/src/lib/warehouses.service.ts`
- Create: `libs/domains/warehouses/api/src/lib/warehouses.module.ts`
- Create: `libs/domains/warehouses/api/src/index.ts`

- [ ] **Step 1: Create API library**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
npx nx g @nx/nest:lib libs/domains/warehouses/api \
  --name=api \
  --directory=libs/domains/warehouses/api
```

- [ ] **Step 2: Add tags**

Edit `libs/domains/warehouses/api/project.json`:

```json
{
  "tags": ["domain:warehouses", "layer:api", "scope:api", "team:fulfillment", "maturity:stable", "type:feature"]
}
```

- [ ] **Step 3: Update tsconfig.json**

Edit `libs/domains/warehouses/api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@swiftship/domains/warehouses/types": ["libs/domains/warehouses/types/src/index.ts"],
      "@swiftship/domains/warehouses/data-access": ["libs/domains/warehouses/data-access/src/index.ts"]
    }
  }
}
```

- [ ] **Step 4: Create service**

Create `libs/domains/warehouses/api/src/lib/warehouses.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { WarehouseRepository } from '@swiftship/domains/warehouses/data-access';
import { CreateWarehouseInput, UpdateWarehouseInput } from '@swiftship/domains/warehouses/types';

@Injectable()
export class WarehousesService {
  constructor(private repository: WarehouseRepository) {}

  async findAll() {
    return this.repository.findAll();
  }

  async findById(id: number) {
    const warehouse = await this.repository.findById(id);
    if (!warehouse) {
      throw new NotFoundException(`Warehouse ${id} not found`);
    }
    return warehouse;
  }

  async findActive() {
    return this.repository.findActive();
  }

  async create(input: CreateWarehouseInput) {
    return this.repository.create(input);
  }

  async update(id: number, input: UpdateWarehouseInput) {
    await this.findById(id); // validates exists
    return this.repository.update(id, input);
  }

  async delete(id: number) {
    await this.findById(id); // validates exists
    return this.repository.delete(id);
  }
}
```

- [ ] **Step 5: Create resolver**

Create `libs/domains/warehouses/api/src/lib/warehouses.resolver.ts`:

```typescript
import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard, RolesGuard } from '@swiftship/platform/auth';
import { Roles } from '@swiftship/platform/auth';
import { Warehouse, CreateWarehouseInput, UpdateWarehouseInput } from '@swiftship/domains/warehouses/types';
import { WarehousesService } from './warehouses.service';

@Resolver(() => Warehouse)
@UseGuards(GqlAuthGuard, RolesGuard)
export class WarehousesResolver {
  constructor(private service: WarehousesService) {}

  @Query(() => [Warehouse])
  @Roles('admin', 'seller')
  async warehouses(): Promise<Warehouse[]> {
    return this.service.findAll();
  }

  @Query(() => Warehouse)
  @Roles('admin', 'seller')
  async warehouse(@Args('id', { type: () => Int }) id: number): Promise<Warehouse> {
    return this.service.findById(id);
  }

  @Query(() => [Warehouse])
  @Roles('admin', 'seller')
  async activeWarehouses(): Promise<Warehouse[]> {
    return this.service.findActive();
  }

  @Mutation(() => Warehouse)
  @Roles('admin')
  async createWarehouse(@Args('input') input: CreateWarehouseInput): Promise<Warehouse> {
    return this.service.create(input);
  }

  @Mutation(() => Warehouse)
  @Roles('admin')
  async updateWarehouse(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateWarehouseInput,
  ): Promise<Warehouse> {
    return this.service.update(id, input);
  }

  @Mutation(() => Warehouse)
  @Roles('admin')
  async deleteWarehouse(@Args('id', { type: () => Int }) id: number): Promise<Warehouse> {
    return this.service.delete(id);
  }
}
```

- [ ] **Step 6: Create module**

Create `libs/domains/warehouses/api/src/lib/warehouses.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { WarehouseRepository } from '@swiftship/domains/warehouses/data-access';
import { WarehousesService } from './warehouses.service';
import { WarehousesResolver } from './warehouses.resolver';

@Module({
  providers: [WarehouseRepository, WarehousesService, WarehousesResolver],
  exports: [WarehousesService],
})
export class WarehousesModule {}
```

- [ ] **Step 7: Export from index**

Edit `libs/domains/warehouses/api/src/index.ts`:

```typescript
export * from './lib/warehouses.module';
export * from './lib/warehouses.service';
export * from './lib/warehouses.resolver';
```

- [ ] **Step 8: Build API library**

```bash
npx nx build warehouses-api
```

Expected: Build succeeds

- [ ] **Step 9: Commit**

```bash
git add libs/domains/warehouses/api
git commit -m "feat(warehouses): migrate API to Nx library"
```

---

## Task 4: Migrate Warehouses Domain - UI

**Files:**
- Create: `libs/domains/warehouses/ui/src/lib/warehouses-list.tsx`
- Create: `libs/domains/warehouses/ui/src/lib/warehouse-form.tsx`
- Create: `libs/domains/warehouses/ui/src/index.ts`

- [ ] **Step 1: Create UI library**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
npx nx g @nx/react:lib libs/domains/warehouses/ui \
  --name=ui \
  --directory=libs/domains/warehouses/ui
```

- [ ] **Step 2: Add tags**

Edit `libs/domains/warehouses/ui/project.json`:

```json
{
  "tags": ["domain:warehouses", "layer:ui", "scope:admin-portal", "team:fulfillment", "maturity:stable", "type:ui"]
}
```

- [ ] **Step 3: Update tsconfig.json**

Edit `libs/domains/warehouses/ui/tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@swiftship/domains/warehouses/types": ["libs/domains/warehouses/types/src/index.ts"],
      "@swiftship/shared/ui": ["libs/shared/ui/src/index.ts"]
    }
  }
}
```

- [ ] **Step 4: Create warehouses list component**

Create `libs/domains/warehouses/ui/src/lib/warehouses-list.tsx`:

```typescript
import { gql, useQuery, useMutation } from '@apollo/client';
import { Table, Button, Modal, Input } from '@swiftship/shared/ui';
import { useState } from 'react';

const WAREHOUSES_QUERY = gql`
  query GetWarehouses {
    warehouses {
      id
      name
      city
      state
      pincode
      isActive
    }
  }
`;

const DELETE_WAREHOUSE_MUTATION = gql`
  mutation DeleteWarehouse($id: Int!) {
    deleteWarehouse(id: $id) {
      id
    }
  }
`;

export function WarehousesList() {
  const { data, loading, refetch } = useQuery(WAREHOUSES_QUERY);
  const [deleteWarehouse] = useMutation(DELETE_WAREHOUSE_MUTATION);
  const [search, setSearch] = useState('');

  const filtered = data?.warehouses?.filter((w: any) =>
    w.name.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const handleDelete = async (id: number) => {
    if (confirm('Delete this warehouse?')) {
      await deleteWarehouse({ variables: { id } });
      refetch();
    }
  };

  return (
    <div>
      <Input
        placeholder="Search warehouses..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Table
        loading={loading}
        data={filtered}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'city', label: 'City' },
          { key: 'state', label: 'State' },
          { key: 'pincode', label: 'Pincode' },
          {
            key: 'actions',
            label: 'Actions',
            render: (row: any) => (
              <Button variant="ghost" onClick={() => handleDelete(row.id)}>
                Delete
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 5: Create warehouse form component**

Create `libs/domains/warehouses/ui/src/lib/warehouse-form.tsx`:

```typescript
import { gql, useMutation } from '@apollo/client';
import { Input, Button } from '@swiftship/shared/ui';
import { useState } from 'react';
import { CreateWarehouseInput } from '@swiftship/domains/warehouses/types';

const CREATE_WAREHOUSE_MUTATION = gql`
  mutation CreateWarehouse($input: CreateWarehouseInput!) {
    createWarehouse(input: $input) {
      id
      name
    }
  }
`;

export function WarehouseForm({ onSuccess }: { onSuccess?: () => void }) {
  const [createWarehouse, { loading }] = useMutation(CREATE_WAREHOUSE_MUTATION);
  const [form, setForm] = useState<CreateWarehouseInput>({
    name: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    latitude: 0,
    longitude: 0,
    isActive: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createWarehouse({ variables: { input: form } });
    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit}>
      <Input
        placeholder="Name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <Input
        placeholder="Address"
        value={form.address}
        onChange={(e) => setForm({ ...form, address: e.target.value })}
      />
      <Input
        placeholder="City"
        value={form.city}
        onChange={(e) => setForm({ ...form, city: e.target.value })}
      />
      <Input
        placeholder="State"
        value={form.state}
        onChange={(e) => setForm({ ...form, state: e.target.value })}
      />
      <Input
        placeholder="Pincode"
        value={form.pincode}
        onChange={(e) => setForm({ ...form, pincode: e.target.value })}
      />
      <Button type="submit" loading={loading}>
        Create Warehouse
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Export from index**

Edit `libs/domains/warehouses/ui/src/index.ts`:

```typescript
export * from './lib/warehouses-list';
export * from './lib/warehouse-form';
```

- [ ] **Step 7: Build UI library**

```bash
npx nx build warehouses-ui
```

Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add libs/domains/warehouses/ui
git commit -m "feat(warehouses): migrate UI to Nx library"
```

---

## Task 5: Validate Warehouses Migration

**Files:**
- None (validation only)

- [ ] **Step 1: Run all warehouse tests**

```bash
npx nx run-many --target=test --projects=warehouses-types,warehouses-data-access,warehouses-api
```

Expected: All tests pass

- [ ] **Step 2: Run lint**

```bash
npx nx run-many --target=lint --projects=warehouses-types,warehouses-data-access,warehouses-api,warehouses-ui
```

Expected: No errors (warnings OK)

- [ ] **Step 3: Build all warehouse libs**

```bash
npx nx run-many --target=build --projects=warehouse*
```

Expected: All builds succeed

- [ ] **Step 4: Verify GraphQL schema still generates**

```bash
# (Will be wired up in Plan 4, for now just verify imports work)
npx tsc --noEmit libs/domains/warehouses/api/src/index.ts
```

Expected: No type errors

---

## Task 6: Delete Old Warehouses Code

**Files:**
- Delete: `src/warehouses/` (entire directory)

- [ ] **Step 1: Verify Nx has the new libs**

```bash
npx nx show projects | grep warehouse
```

Expected: `warehouses-types`, `warehouses-data-access`, `warehouses-api`, `warehouses-ui`

- [ ] **Step 2: Run all tests one more time**

```bash
npm test
```

Expected: All tests pass

- [ ] **Step 3: Delete old code**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
rm -rf src/warehouses/
```

- [ ] **Step 4: Verify no broken imports**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No warehouse-related errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(warehouses): remove old src/warehouses directory"
```

---

## Task 7: Migrate Notifications Domain (Repeat Pattern)

**Files:**
- Create: `libs/domains/notifications/{types,data-access,api,ui}/`
- Delete: `src/notifications/`

- [ ] **Step 1: Generate all 4 libraries**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"

# Types
npx nx g @nx/node:lib libs/domains/notifications/types --directory=libs/domains/notifications/types

# Data Access
npx nx g @nx/node:lib libs/domains/notifications/data-access --directory=libs/domains/notifications/data-access

# API
npx nx g @nx/nest:lib libs/domains/notifications/api --directory=libs/domains/notifications/api

# UI
npx nx g @nx/react:lib libs/domains/notifications/ui --directory=libs/domains/notifications/ui
```

- [ ] **Step 2: Add tags to all 4 project.json files**

Run this script:

```bash
cat > /tmp/add-notification-tags.sh << 'EOF'
#!/bin/bash
for layer in types data-access api ui; do
  cat > libs/domains/notifications/$layer/project.json << JSON
{
  "name": "notifications-$layer",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/domains/notifications/$layer/src",
  "projectType": "library",
  "tags": ["domain:notifications", "layer:$layer", "team:notifications", "maturity:stable", "type:feature"],
  "targets": {}
}
JSON
done
EOF
bash /tmp/add-notification-tags.sh
```

- [ ] **Step 3: Move notification model**

```bash
mv src/notifications/notifications.model.ts libs/domains/notifications/types/src/lib/
```

- [ ] **Step 4: Move notification service**

```bash
mv src/notifications/notifications.service.ts libs/domains/notifications/api/src/lib/
```

- [ ] **Step 5: Move notification resolver**

```bash
mv src/notifications/notifications.resolver.ts libs/domains/notifications/api/src/lib/
```

- [ ] **Step 6: Move notification module**

```bash
mv src/notifications/notifications.module.ts libs/domains/notifications/api/src/lib/
```

- [ ] **Step 7: Update imports in moved files**

Edit `libs/domains/notifications/api/src/lib/*.ts`, update relative imports to use path mappings:

```typescript
// Before
import { Notification } from '../notifications.model';
// After
import { Notification } from '@swiftship/domains/notifications/types';
```

- [ ] **Step 8: Build and test**

```bash
npx nx run-many --target=build --projects=notifications-*
npx nx run-many --target=test --projects=notifications-*
```

Expected: All succeed

- [ ] **Step 9: Delete old code**

```bash
rm -rf src/notifications/
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(notifications): migrate to Nx libraries"
```

---

## Task 8: Migrate Serviceability Domain (Repeat Pattern)

**Files:**
- Create: `libs/domains/serviceability/{types,data-access,api,ui}/`
- Delete: `src/serviceability/`

- [ ] **Step 1: Generate libraries**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"

npx nx g @nx/node:lib libs/domains/serviceability/types --directory=libs/domains/serviceability/types
npx nx g @nx/node:lib libs/domains/serviceability/data-access --directory=libs/domains/serviceability/data-access
npx nx g @nx/nest:lib libs/domains/serviceability/api --directory=libs/domains/serviceability/api
npx nx g @nx/react:lib libs/domains/serviceability/ui --directory=libs/domains/serviceability/ui
```

- [ ] **Step 2: Add tags**

```bash
for layer in types data-access api ui; do
  cat > libs/domains/serviceability/$layer/project.json << JSON
{
  "name": "serviceability-$layer",
  "sourceRoot": "libs/domains/serviceability/$layer/src",
  "projectType": "library",
  "tags": ["domain:serviceability", "layer:$layer", "team:logistics", "maturity:stable", "type:feature"],
  "targets": {}
}
JSON
done
```

- [ ] **Step 3: Move files**

```bash
mv src/serviceability/*.ts libs/domains/serviceability/types/src/lib/ 2>/dev/null
mv src/serviceability/dto/*.ts libs/domains/serviceability/types/src/lib/dto/ 2>/dev/null
mv src/serviceability/serviceability.repository.ts libs/domains/serviceability/data-access/src/lib/ 2>/dev/null
mv src/serviceability/serviceability.resolver.ts libs/domains/serviceability/api/src/lib/ 2>/dev/null
mv src/serviceability/serviceability.service.ts libs/domains/serviceability/api/src/lib/ 2>/dev/null
mv src/serviceability/serviceability.module.ts libs/domains/serviceability/api/src/lib/ 2>/dev/null
```

- [ ] **Step 4: Update imports**

```bash
# Use sed to update imports (or manually edit)
find libs/domains/serviceability -name "*.ts" -exec sed -i "s|from '\\./\\.\\./|from '@swiftship/domains/serviceability/|g" {} \;
```

- [ ] **Step 5: Build and test**

```bash
npx nx run-many --target=build --projects=serviceability-*
npx nx run-many --target=test --projects=serviceability-*
```

- [ ] **Step 6: Delete old code**

```bash
rm -rf src/serviceability/
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(serviceability): migrate to Nx libraries"
```

---

## Task 9: Validate Pilot Migration

**Files:**
- None (validation only)

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: All tests pass

- [ ] **Step 2: Build all projects**

```bash
npx nx run-many --target=build --all
```

Expected: All builds succeed

- [ ] **Step 3: Lint all projects**

```bash
npx nx run-many --target=lint --all
```

Expected: No errors

- [ ] **Step 4: Check boundary violations**

```bash
npx nx run-many --target=lint --all 2>&1 | grep "boundary"
```

Expected: Only warnings (not errors yet)

- [ ] **Step 5: Verify Nx graph**

```bash
npx nx graph --file=tmp/pilot-graph.json
```

Expected: 3 domains (warehouses, notifications, serviceability) visible in graph

- [ ] **Step 6: Update migration log**

Edit `docs/superpowers/migration-log.md`, add Plan 2 completion:

```markdown
## Plan 2: Pilot Migration (Complete)

**Date:** 2026-06-15
**Status:** ✅ Complete

### Domains Migrated
- [x] warehouses (types, data-access, api, ui)
- [x] notifications (types, data-access, api, ui)
- [x] serviceability (types, data-access, api, ui)

### Validation
- ✅ All tests pass
- ✅ All builds succeed
- ✅ Lint passes (warnings only, as expected)
- ✅ Old src/ directories removed

### Lessons Learned
- Pattern works well
- Estimated 2-3 hours per domain
- Need to automate file moves for bulk migration (Plan 3)
```

- [ ] **Step 7: Commit log update**

```bash
git add docs/superpowers/migration-log.md
git commit -m "docs: mark Plan 2 complete in migration log"
```

---

## Plan 2 Completion Checklist

- [ ] Warehouses domain migrated (4 libs)
- [ ] Notifications domain migrated (4 libs)
- [ ] Serviceability domain migrated (4 libs)
- [ ] All old code deleted from src/
- [ ] All tests pass
- [ ] All builds succeed
- [ ] Lint passes
- [ ] Migration log updated
- [ ] All changes committed

**Estimated Time:** 4 days (1.3 days per domain)

**Next:** [Plan 3: Bulk Migration](./2026-06-12-nx-monorepo-plan-3-bulk-migration.md) - Migrate remaining 17+ domains using the validated pattern
