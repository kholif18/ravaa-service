---
name: database
description: Reference for database patterns in Ravaa-Service — Prisma 7 schema design, migrations, queries, transactions, PostgreSQL features. Use when modifying the schema, writing queries, or working on database operations. Triggers on "prisma", "schema", "migration", "database", "query", "transaction", "postgresql".
---

# Database Reference (Prisma 7 + PostgreSQL)

## Prisma 7 Changes (vs v6)

- **No `url` in schema.prisma** — use `prisma.config.ts`
- **Driver adapter required** — `PrismaPg` from `@prisma/adapter-pg`
- **Client initialization** — must pass adapter to constructor

### prisma.config.ts

```typescript
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
```

### Client initialization (`src/db/index.ts`)

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

// Lazy init with Proxy for hot reload safety
export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    return Reflect.get(getPrisma(), prop);
  },
});
```

## Schema Patterns

### Model with UUID primary key

```prisma
model User {
  id        String   @id @default(uuid()) @db.Uuid
  email     String   @unique
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("users")
}
```

### Enum

```prisma
enum UserStatus {
  active
  suspended
  pending
}

model User {
  status UserStatus @default(pending)
}
```

### Self-relation

```prisma
model Folder {
  id       String  @id @default(uuid()) @db.Uuid
  parentId String? @map("parent_id") @db.Uuid
  parent   Folder? @relation("FolderTree", fields: [parentId], references: [id])
  children Folder[] @relation("FolderTree")

  @@map("folders")
}
```

### Polymorphic relation (manual)

```prisma
model Share {
  id             String  @id @default(uuid()) @db.Uuid
  shareableType  String  @map("shareable_type")  // "file" | "folder" | "note"
  shareableId    String  @map("shareable_id") @db.Uuid
  // ... other fields
}
```

### JSON field

```prisma
model AuditLog {
  metadata Json?  // PostgreSQL JSONB
}
```

## Naming Convention

| Prisma | Database |
|--------|----------|
| `User` | `users` |
| `ApplicationScope` | `application_scopes` |
| `userApplicationAccess` | `user_application_access` |
| `passwordHash` | `password_hash` |
| `createdAt` | `created_at` |

Use `@@map("table_name")` and `@map("column_name")`.

## Common Queries

### Find with relation

```typescript
const session = await prisma.session.findFirst({
  where: { refreshTokenHash: tokenHash },
  include: { user: true },
});
```

### Transaction

```typescript
const result = await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data: { ... } });
  const session = await tx.session.create({ data: { userId: user.id, ... } });
  return { user, session };
});
```

### Raw query (health check)

```typescript
await prisma.$queryRaw`SELECT 1`;
```

### Update many

```typescript
await prisma.session.updateMany({
  where: { userId, revokedAt: null },
  data: { revokedAt: new Date() },
});
```

## Migrations

```bash
# Create migration
npx prisma migrate dev --name migration_name

# Apply in production
npx prisma migrate deploy

# Push schema without migration (dev only)
npx prisma db push

# Regenerate client
npx prisma generate

# Open Prisma Studio
npx prisma studio
```

## PostgreSQL Features

- **UUID**: native support, use `@db.Uuid`
- **JSONB**: use `Json` type in Prisma
- **Arrays**: use `String[]` in Prisma (PostgreSQL array)
- **INET**: use `String` in Prisma (for IP addresses)
- **Timestamps**: always UTC

## Gotchas

1. **Prisma 7 requires driver adapter** — without `PrismaPg`, you get "client password must be a string"
2. **No `url` in schema** — must use `prisma.config.ts`
3. **Lazy initialization** — Prisma client must be created after env is loaded
4. **Transaction isolation** — Prisma uses READ COMMITTED by default
5. **UUID vs autoincrement** — always use UUID for new tables
6. **Snake_case** — database uses snake_case, Prisma uses camelCase

## Verification

After schema changes:

```bash
npx prisma generate         # Regenerate client
npx prisma migrate dev      # Create migration
npm run typecheck           # Verify types
npm test                    # Verify queries work
```
