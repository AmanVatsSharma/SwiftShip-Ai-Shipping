# Plan 4: App Extraction & Next.js Setup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the NestJS API to `apps/api/` and scaffold three Next.js applications (admin-portal, customer-portal, partner-portal) with GraphQL codegen for type-safe API contracts.

**Architecture:** API is a thin shell that imports domain libraries. Next.js apps are independent deployables that share 70-80% of code via `libs/`. GraphQL Code Generator creates type-safe hooks from co-located `.graphql` operations.

**Tech Stack:** NestJS, Next.js 14, Apollo Client, GraphQL Code Generator, Tailwind CSS, shadcn/ui

---

## Task 1: Extract NestJS API to apps/api

**Files:**
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app/app.module.ts`
- Create: `apps/api/project.json`
- Delete: `src/main.ts`, `src/app.module.ts`, `src/app.controller.ts`, `src/app.resolver.ts`, `src/app.service.ts`, `src/health.controller.ts`

- [ ] **Step 1: Generate NestJS app**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
npx nx g @nx/nest:app apps/api --directory=apps/api
```

- [ ] **Step 2: Add tags to apps/api/project.json**

```json
{
  "tags": ["scope:api", "type:app"]
}
```

- [ ] **Step 3: Move main.ts to apps/api**

```bash
mv src/main.ts apps/api/src/main.ts
```

- [ ] **Step 4: Create app module that imports all domain libs**

Create `apps/api/src/app/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';
import { environmentValidationSchema } from '@swiftship/platform/config';
import { PrismaService } from '@swiftship/platform/prisma';
import { AppController } from './app.controller';
import { AppResolver } from './app.resolver';
import { AppService } from './app.service';
import { HealthController } from './health.controller';

// Import all domain modules
import { OrdersModule } from '@swiftship/domains/orders/api';
import { CarriersModule } from '@swiftship/domains/carriers/api';
import { ShippingRatesModule } from '@swiftship/domains/shipping-rates/api';
import { ShipmentsModule } from '@swiftship/domains/shipments/api';
import { ReturnsModule } from '@swiftship/domains/returns/api';
import { RolesModule } from '@swiftship/domains/users/api';
import { AuthModule } from '@swiftship/domains/auth/api';
import { OnboardingModule } from '@swiftship/domains/onboarding/api';
import { PickupsModule } from '@swiftship/domains/pickups/api';
import { ManifestsModule } from '@swiftship/domains/manifests/api';
import { NdrModule } from '@swiftship/domains/ndr/api';
import { CodModule } from '@swiftship/domains/cod/api';
import { WebhooksModule } from '@swiftship/domains/webhooks/api';
import { RateShopModule } from '@swiftship/domains/rate-shop/api';
import { ServiceabilityModule } from '@swiftship/domains/serviceability/api';
import { SurchargesModule } from '@swiftship/domains/surcharges/api';
import { QueuesModule } from '@swiftship/platform/queues';
import { DashboardModule } from '@swiftship/domains/dashboard/api';
import { PaymentsModule } from '@swiftship/domains/payments/api';
import { NotificationsModule } from '@swiftship/domains/notifications/api';
import { BillingModule } from '@swiftship/domains/billing/api';
import { BulkOperationsModule } from '@swiftship/domains/bulk-operations/api';
import { WarehousesModule } from '@swiftship/domains/warehouses/api';
import { StorageModule } from '@swiftship/platform/storage';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: environmentValidationSchema,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'apps/api/src/app/schema.graphql'),
      playground: process.env.NODE_ENV !== 'production',
      context: ({ req }) => ({ req }),
    }),
    // Domain modules
    OrdersModule,
    CarriersModule,
    ShippingRatesModule,
    ShipmentsModule,
    ReturnsModule,
    RolesModule,
    AuthModule,
    OnboardingModule,
    PickupsModule,
    ManifestsModule,
    NdrModule,
    CodModule,
    WebhooksModule,
    RateShopModule,
    ServiceabilityModule,
    SurchargesModule,
    QueuesModule,
    DashboardModule,
    PaymentsModule,
    NotificationsModule,
    BillingModule,
    BulkOperationsModule,
    WarehousesModule,
    StorageModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    AppResolver,
    PrismaService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
```

- [ ] **Step 5: Move app controller, resolver, service**

```bash
mv src/app.controller.ts apps/api/src/app/
mv src/app.resolver.ts apps/api/src/app/
mv src/app.service.ts apps/api/src/app/
mv src/health.controller.ts apps/api/src/app/
```

- [ ] **Step 6: Update apps/api/src/main.ts**

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded, raw } from 'express';
import helmet from 'helmet';
import * as morgan from 'morgan';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Security
  app.use(helmet());
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });
  
  // Body parsers
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  
  // Raw body for Shopify webhooks
  app.use('/shopify/webhook', raw({ type: 'application/json' }));
  
  // Logging
  if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
  }
  
  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}/graphql`);
}

bootstrap();
```

- [ ] **Step 7: Build API app**

```bash
npx nx build api
```

Expected: Build succeeds

- [ ] **Step 8: Start API and verify**

```bash
npx nx serve api
```

In another terminal:

```bash
curl http://localhost:3000/graphql -H "Content-Type: application/json" -d '{"query":"{ __typename }"}'
```

Expected: `{"data":{"__typename":"Query"}}`

- [ ] **Step 9: Delete old src/ files**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
rm -f src/main.ts src/app.module.ts src/app.controller.ts src/app.resolver.ts src/app.service.ts src/health.controller.ts
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(api): extract NestJS to apps/api"
```

---

## Task 2: Create Shared Design System Library

**Files:**
- Create: `libs/shared/ui/` (with shadcn/ui components)

- [ ] **Step 1: Generate shared UI library**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
npx nx g @nx/react:lib libs/shared/ui --directory=libs/shared/ui
```

- [ ] **Step 2: Add tags**

Edit `libs/shared/ui/project.json`:

```json
{
  "tags": ["layer:ui", "scope:shared", "team:design-system", "maturity:stable", "type:ui"]
}
```

- [ ] **Step 3: Install shadcn/ui dependencies**

```bash
npm install class-variance-authority clsx tailwind-merge lucide-react
```

- [ ] **Step 4: Create Tailwind config**

Create `libs/shared/ui/tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
```

- [ ] **Step 5: Create utility helper**

Create `libs/shared/ui/src/lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: Create Button component**

Create `libs/shared/ui/src/lib/components/button.tsx`:

```typescript
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'underline-offset-4 hover:underline text-primary',
      },
      size: {
        default: 'h-10 py-2 px-4',
        sm: 'h-9 px-3 rounded-md',
        lg: 'h-11 px-8 rounded-md',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={loading}
        {...props}
      >
        {loading ? 'Loading...' : children}
      </button>
    );
  }
);
Button.displayName = 'Button';
```

- [ ] **Step 7: Create Input component**

Create `libs/shared/ui/src/lib/components/input.tsx`:

```typescript
import * as React from 'react';
import { cn } from '../utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
```

- [ ] **Step 8: Create Table component**

Create `libs/shared/ui/src/lib/components/table.tsx`:

```typescript
import * as React from 'react';
import { cn } from '../utils';

export interface TableColumn<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  width?: string;
}

export interface TableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function Table<T extends Record<string, any>>({
  data,
  columns,
  loading,
  emptyMessage = 'No data',
  className,
}: TableProps<T>) {
  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (data.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <div className={cn('relative w-full overflow-auto', className)}>
      <table className="w-full caption-bottom text-sm">
        <thead className="border-b">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="h-12 px-4 text-left align-middle font-medium"
                style={{ width: col.width }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx} className="border-b transition-colors hover:bg-muted/50">
              {columns.map((col) => (
                <td key={col.key} className="p-4 align-middle">
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 9: Create Modal component**

Create `libs/shared/ui/src/lib/components/modal.tsx`:

```typescript
import * as React from 'react';
import { cn } from '../utils';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn(
          'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex flex-col space-y-1.5 text-center sm:text-left">
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Create globals.css**

Create `libs/shared/ui/src/lib/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 11: Export all components from index**

Edit `libs/shared/ui/src/index.ts`:

```typescript
export * from './lib/utils';
export * from './lib/components/button';
export * from './lib/components/input';
export * from './lib/components/table';
export * from './lib/components/modal';
export * from './lib/globals.css';
```

- [ ] **Step 12: Build shared UI**

```bash
npx nx build shared-ui
```

Expected: Build succeeds

- [ ] **Step 13: Commit**

```bash
git add libs/shared/ui
git commit -feat(shared-ui): "feat(shared-ui): add design system with shadcn/ui"
```

---

## Task 3: Create Shared GraphQL Library

**Files:**
- Create: `libs/shared/graphql/`

- [ ] **Step 1: Generate shared graphql library**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
npx nx g @nx/node:lib libs/shared/graphql --directory=libs/shared/graphql
```

- [ ] **Step 2: Add tags**

Edit `libs/shared/graphql/project.json`:

```json
{
  "tags": ["layer:platform", "scope:shared", "team:platform", "maturity:stable", "type:ui"]
}
```

- [ ] **Step 3: Install GraphQL dependencies**

```bash
npm install @apollo/client graphql
npm install -D @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-operations @graphql-codegen/typescript-react-apollo
```

- [ ] **Step 4: Create Apollo client factory**

Create `libs/shared/graphql/src/lib/client.ts`:

```typescript
import { ApolloClient, InMemoryCache, HttpLink, from } from '@apollo/client';
import { onError } from '@apollo/client/link/error';

export function createApolloClient(apiUrl: string, getToken?: () => string | null) {
  const httpLink = new HttpLink({
    uri: apiUrl,
    credentials: 'include',
  });

  const errorLink = onError(({ graphQLErrors, networkError }) => {
    if (graphQLErrors) {
      graphQLErrors.forEach(({ message, locations, path }) =>
        console.error(`[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`)
      );
    }
    if (networkError) {
      console.error(`[Network error]: ${networkError}`);
    }
  });

  return new ApolloClient({
    link: from([errorLink, httpLink]),
    cache: new InMemoryCache({
      typePolicies: {
        Query: {
          fields: {
            // Pagination merge functions
            orders: {
              keyArgs: ['filter'],
              merge(existing, incoming) {
                return incoming;
              },
            },
          },
        },
      },
    }),
    defaultOptions: {
      watchQuery: { fetchPolicy: 'cache-and-network' },
    },
  });
}
```

- [ ] **Step 5: Create codegen config**

Create `codegen.ts` at repo root:

```typescript
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'apps/api/src/app/schema.graphql',
  documents: [
    'libs/domains/*/ui/src/**/*.{ts,tsx}',
    'libs/shared/**/*.{ts,tsx}',
    'apps/*/pages/**/*.{ts,tsx}',
    'apps/*/src/**/*.{ts,tsx}',
  ],
  generates: {
    'libs/shared/graphql/src/lib/generated.ts': {
      plugins: [
        'typescript',
        'typescript-operations',
        'typescript-react-apollo',
      ],
      config: {
        withHooks: true,
        withComponent: false,
        withHOC: false,
        reactApolloVersion: 3,
        scalars: {
          DateTime: 'string',
          JSON: 'Record<string, any>',
        },
        avoidOptionals: {
          field: true,
        },
      },
    },
  },
};

export default config;
```

- [ ] **Step 6: Create codegen executor in Nx**

Add to `libs/shared/graphql/project.json`:

```json
{
  "targets": {
    "generate": {
      "executor": "nx:run-commands",
      "options": {
        "command": "graphql-codegen --config codegen.ts"
      }
    }
  }
}
```

- [ ] **Step 7: Export from index**

Edit `libs/shared/graphql/src/index.ts`:

```typescript
export * from './lib/client';
export * from './lib/generated';
```

- [ ] **Step 8: Run codegen (after API is running)**

```bash
# In one terminal: npx nx serve api
# In another terminal:
npx nx run shared-graphql:generate
```

Expected: `libs/shared/graphql/src/lib/generated.ts` created

- [ ] **Step 9: Commit**

```bash
git add libs/shared/graphql codegen.ts
git commit -m "feat(shared-graphql): add Apollo client + codegen"
```

---

## Task 4: Create Shared Utils Library

**Files:**
- Create: `libs/shared/utils/`

- [ ] **Step 1: Generate shared utils library**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
npx nx g @nx/node:lib libs/shared/utils --directory=libs/shared/utils
```

- [ ] **Step 2: Add tags**

Edit `libs/shared/utils/project.json`:

```json
{
  "tags": ["layer:utils", "scope:shared", "team:platform", "maturity:stable", "type:util"]
}
```

- [ ] **Step 3: Create utility functions**

Create `libs/shared/utils/src/lib/format.ts`:

```typescript
export function formatCurrency(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatDate(date: string | Date, format: 'short' | 'long' | 'medium' = 'medium'): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions = {
    short: { dateStyle: 'short' },
    medium: { dateStyle: 'medium' },
    long: { dateStyle: 'long', timeStyle: 'short' },
  }[format];
  return new Intl.DateTimeFormat('en-IN', options).format(dateObj);
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return phone;
}
```

Create `libs/shared/utils/src/lib/validation.ts`:

```typescript
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone.replace(/\D/g, ''));
}

export function isValidPincode(pincode: string): boolean {
  return /^[1-9][0-9]{5}$/.test(pincode);
}

export function isValidGSTIN(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin);
}
```

Create `libs/shared/utils/src/lib/index.ts`:

```typescript
export * from './format';
export * from './validation';
```

- [ ] **Step 4: Export from root index**

Edit `libs/shared/utils/src/index.ts`:

```typescript
export * from './lib/format';
export * from './lib/validation';
```

- [ ] **Step 5: Build and test**

```bash
npx nx build shared-utils
npx nx test shared-utils
```

- [ ] **Step 6: Commit**

```bash
git add libs/shared/utils
git commit -m "feat(shared-utils): add format and validation utilities"
```

---

## Task 5: Create Admin Portal Next.js App

**Files:**
- Create: `apps/admin-portal/`

- [ ] **Step 1: Generate Next.js app**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
npx nx g @nx/next:app apps/admin-portal --style=tailwind --appRouter=false
```

- [ ] **Step 2: Add tags to project.json**

Edit `apps/admin-portal/project.json`:

```json
{
  "tags": ["scope:admin-portal", "type:app"]
}
```

- [ ] **Step 3: Create Apollo provider**

Create `apps/admin-portal/src/app/providers/apollo-provider.tsx`:

```typescript
'use client';

import { ApolloProvider } from '@apollo/client';
import { createApolloClient } from '@swiftship/shared/graphql';
import { ReactNode, useMemo } from 'react';

export function AdminApolloProvider({ children }: { children: ReactNode }) {
  const client = useMemo(
    () => createApolloClient(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/graphql'),
    []
  );

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
```

- [ ] **Step 4: Create admin layout**

Create `apps/admin-portal/src/app/layouts/admin-layout.tsx`:

```typescript
import { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@swiftship/shared/ui';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/orders', label: 'Orders' },
  { href: '/carriers', label: 'Carriers' },
  { href: '/shipments', label: 'Shipments' },
  { href: '/warehouses', label: 'Warehouses' },
  { href: '/users', label: 'Users' },
  { href: '/settings', label: 'Settings' },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <aside className="w-64 border-r bg-card">
        <div className="p-6">
          <h1 className="text-2xl font-bold">SwiftShip Admin</h1>
        </div>
        <nav className="space-y-1 px-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 5: Create auth middleware**

Create `apps/admin-portal/src/app/middleware/auth.tsx`:

```typescript
import { useRouter } from 'next/router';
import { useEffect, ComponentType } from 'react';
import { gql, useQuery } from '@apollo/client';

const ME_QUERY = gql`
  query Me {
    me {
      id
      email
      roles
    }
  }
`;

export function withAuth<P extends object>(
  Component: ComponentType<P>,
  options: { requiredRole?: string } = {}
) {
  return function AuthenticatedComponent(props: P) {
    const router = useRouter();
    const { data, loading } = useQuery(ME_QUERY);

    useEffect(() => {
      if (!loading && !data?.me) {
        router.push('/login');
      } else if (!loading && options.requiredRole && !data?.me?.roles.includes(options.requiredRole)) {
        router.push('/unauthorized');
      }
    }, [loading, data, router]);

    if (loading || !data?.me) {
      return <div>Loading...</div>;
    }

    return <Component {...props} />;
  };
}
```

- [ ] **Step 6: Update _app.tsx**

Edit `apps/admin-portal/pages/_app.tsx`:

```typescript
import type { AppProps } from 'next/app';
import { AdminApolloProvider } from '../src/app/providers/apollo-provider';
import '@swiftship/shared/ui/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AdminApolloProvider>
      <Component {...pageProps} />
    </AdminApolloProvider>
  );
}
```

- [ ] **Step 7: Create dashboard page**

Create `apps/admin-portal/pages/index.tsx`:

```typescript
import { AdminLayout } from '../src/app/layouts/admin-layout';
import { withAuth } from '../src/app/middleware/auth';
import { Card } from '@swiftship/shared/ui';
import { gql, useQuery } from '@apollo/client';

const DASHBOARD_QUERY = gql`
  query Dashboard {
    orderCounts {
      pending
      shipped
      delivered
      returned
    }
    totalSales
  }
`;

function DashboardPage() {
  const { data, loading } = useQuery(DASHBOARD_QUERY);

  return (
    <AdminLayout>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <h3 className="text-sm font-medium text-muted-foreground">Pending Orders</h3>
          <p className="text-2xl font-bold">{data?.orderCounts?.pending ?? '-'}</p>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-muted-foreground">Shipped</h3>
          <p className="text-2xl font-bold">{data?.orderCounts?.shipped ?? '-'}</p>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-muted-foreground">Delivered</h3>
          <p className="text-2xl font-bold">{data?.orderCounts?.delivered ?? '-'}</p>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-muted-foreground">Total Sales</h3>
          <p className="text-2xl font-bold">₹{data?.totalSales ?? '-'}</p>
        </Card>
      </div>
    </AdminLayout>
  );
}

export default withAuth(DashboardPage, { requiredRole: 'admin' });
```

- [ ] **Step 8: Create orders page**

Create `apps/admin-portal/pages/orders/index.tsx`:

```typescript
import { AdminLayout } from '../../src/app/layouts/admin-layout';
import { withAuth } from '../../src/app/middleware/auth';
import { WarehousesList } from '@swiftship/domains/warehouses/ui';

function OrdersPage() {
  return (
    <AdminLayout>
      <h1 className="text-3xl font-bold mb-8">Warehouses</h1>
      <WarehousesList />
    </AdminLayout>
  );
}

export default withAuth(OrdersPage, { requiredRole: 'admin' });
```

- [ ] **Step 9: Build admin portal**

```bash
npx nx build admin-portal
```

Expected: Build succeeds

- [ ] **Step 10: Commit**

```bash
git add apps/admin-portal
git commit -m "feat(admin-portal): scaffold Next.js admin app with shared libs"
```

---

## Task 6: Create Customer Portal Next.js App

**Files:**
- Create: `apps/customer-portal/`

- [ ] **Step 1: Generate Next.js app**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
npx nx g @nx/next:app apps/customer-portal --style=tailwind --appRouter=false
```

- [ ] **Step 2: Add tags**

Edit `apps/customer-portal/project.json`:

```json
{
  "tags": ["scope:customer-portal", "type:app"]
}
```

- [ ] **Step 3: Create customer layout**

Create `apps/customer-portal/src/app/layouts/customer-layout.tsx`:

```typescript
import { ReactNode } from 'react';
import Link from 'next/link';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/my-orders', label: 'My Orders' },
  { href: '/track', label: 'Track Shipment' },
  { href: '/profile', label: 'Profile' },
];

export function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary">SwiftShip</h1>
          <nav className="flex gap-6">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm font-medium hover:text-primary">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Create Apollo provider**

Create `apps/customer-portal/src/app/providers/apollo-provider.tsx`:

```typescript
'use client';

import { ApolloProvider } from '@apollo/client';
import { createApolloClient } from '@swiftship/shared/graphql';
import { ReactNode, useMemo } from 'react';

export function CustomerApolloProvider({ children }: { children: ReactNode }) {
  const client = useMemo(
    () => createApolloClient(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/graphql'),
    []
  );

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
```

- [ ] **Step 5: Update _app.tsx**

Edit `apps/customer-portal/pages/_app.tsx`:

```typescript
import type { AppProps } from 'next/app';
import { CustomerApolloProvider } from '../src/app/providers/apollo-provider';
import '@swiftship/shared/ui/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <CustomerApolloProvider>
      <Component {...pageProps} />
    </CustomerApolloProvider>
  );
}
```

- [ ] **Step 6: Create home page**

Create `apps/customer-portal/pages/index.tsx`:

```typescript
import { CustomerLayout } from '../src/app/layouts/customer-layout';

export default function HomePage() {
  return (
    <CustomerLayout>
      <h1 className="text-4xl font-bold mb-4">Welcome to SwiftShip</h1>
      <p className="text-lg text-muted-foreground">
        Track your shipments, manage orders, and more.
      </p>
    </CustomerLayout>
  );
}
```

- [ ] **Step 7: Build customer portal**

```bash
npx nx build customer-portal
```

- [ ] **Step 8: Commit**

```bash
git add apps/customer-portal
git commit -m "feat(customer-portal): scaffold Next.js customer app"
```

---

## Task 7: Create Partner Portal Next.js App

**Files:**
- Create: `apps/partner-portal/`

- [ ] **Step 1: Generate Next.js app**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
npx nx g @nx/next:app apps/partner-portal --style=tailwind --appRouter=false
```

- [ ] **Step 2: Add tags**

Edit `apps/partner-portal/project.json`:

```json
{
  "tags": ["scope:partner-portal", "type:app"]
}
```

- [ ] **Step 3: Create partner layout**

Create `apps/partner-portal/src/app/layouts/partner-layout.tsx`:

```typescript
import { ReactNode } from 'react';
import Link from 'next/link';

const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/webhooks', label: 'Webhooks' },
  { href: '/api-keys', label: 'API Keys' },
];

export function PartnerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <aside className="w-64 bg-secondary border-r">
        <div className="p-6">
          <h1 className="text-2xl font-bold">Partner Portal</h1>
        </div>
        <nav className="space-y-1 px-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Create Apollo provider**

Create `apps/partner-portal/src/app/providers/apollo-provider.tsx`:

```typescript
'use client';

import { ApolloProvider } from '@apollo/client';
import { createApolloClient } from '@swiftship/shared/graphql';
import { ReactNode, useMemo } from 'react';

export function PartnerApolloProvider({ children }: { children: ReactNode }) {
  const client = useMemo(
    () => createApolloClient(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/graphql'),
    []
  );

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
```

- [ ] **Step 5: Update _app.tsx**

Edit `apps/partner-portal/pages/_app.tsx`:

```typescript
import type { AppProps } from 'next/app';
import { PartnerApolloProvider } from '../src/app/providers/apollo-provider';
import '@swiftship/shared/ui/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <PartnerApolloProvider>
      <Component {...pageProps} />
    </PartnerApolloProvider>
  );
}
```

- [ ] **Step 6: Create home page**

Create `apps/partner-portal/pages/index.tsx`:

```typescript
import { PartnerLayout } from '../src/app/layouts/partner-layout';

export default function PartnerHomePage() {
  return (
    <PartnerLayout>
      <h1 className="text-3xl font-bold mb-8">Partner Overview</h1>
      <p className="text-muted-foreground">
        Manage your integrations, webhooks, and API keys.
      </p>
    </PartnerLayout>
  );
}
```

- [ ] **Step 7: Build partner portal**

```bash
npx nx build partner-portal
```

- [ ] **Step 8: Commit**

```bash
git add apps/partner-portal
git commit -m "feat(partner-portal): scaffold Next.js partner app"
```

---

## Task 8: Validate All Apps

**Files:**
- None (validation only)

- [ ] **Step 1: List all apps**

```bash
npx nx show projects --type=app
```

Expected: `api`, `admin-portal`, `customer-portal`, `partner-portal`

- [ ] **Step 2: Build all apps**

```bash
npx nx run-many --target=build --projects=api,admin-portal,customer-portal,partner-portal
```

Expected: All builds succeed

- [ ] **Step 3: Start API**

```bash
npx nx serve api
```

In another terminal:

- [ ] **Step 4: Start admin portal**

```bash
npx nx serve admin-portal
```

Expected: Starts on port 4200

- [ ] **Step 5: Start customer portal**

```bash
npx nx serve customer-portal
```

Expected: Starts on port 4300

- [ ] **Step 6: Start partner portal**

```bash
npx nx serve partner-portal
```

Expected: Starts on port 4400

- [ ] **Step 7: Verify all apps accessible**

Open browser to:
- http://localhost:3000/graphql (API)
- http://localhost:4200 (Admin)
- http://localhost:4300 (Customer)
- http://localhost:4400 (Partner)

- [ ] **Step 8: Stop all servers**

Ctrl+C in each terminal

- [ ] **Step 9: Update migration log**

Edit `docs/superpowers/migration-log.md`:

```markdown
## Plan 4: App Extraction (Complete)

**Date:** 2026-06-27
**Status:** ✅ Complete

### Apps Created
- [x] apps/api (NestJS GraphQL API, port 3000)
- [x] apps/admin-portal (Next.js, port 4200)
- [x] apps/customer-portal (Next.js, port 4300)
- [x] apps/partner-portal (Next.js, port 4400)

### Shared Libraries
- [x] libs/shared/ui (shadcn/ui design system)
- [x] libs/shared/graphql (Apollo client + codegen)
- [x] libs/shared/utils (format, validation)

### Validation
- ✅ All apps build successfully
- ✅ All apps run on correct ports
- ✅ GraphQL endpoint works
- ✅ UI components from shared lib work in all apps

### Next Steps
- Proceed to Plan 5: Cleanup & Enforcement
- Remove old src/ directory
- Enable full boundary enforcement (warnings → errors)
```

- [ ] **Step 10: Commit log**

```bash
git add docs/superpowers/migration-log.md
git commit -m "docs: mark Plan 4 complete in migration log"
```

---

## Plan 4 Completion Checklist

- [ ] NestJS API extracted to apps/api
- [ ] Shared UI library created (shadcn/ui)
- [ ] Shared GraphQL library with codegen
- [ ] Shared utils library
- [ ] Admin portal Next.js app created
- [ ] Customer portal Next.js app created
- [ ] Partner portal Next.js app created
- [ ] All apps build successfully
- [ ] All apps run on correct ports
- [ ] Migration log updated
- [ ] All changes committed

**Estimated Time:** 5 days

**Next:** [Plan 5: Cleanup & Enforcement](./2026-06-12-nx-monorepo-plan-5-cleanup-enforcement.md) - Remove old src/, enable full boundaries, optimize
