# Ravaa Service

Central Account / Identity Service untuk ekosistem Ravaa.

## Development

```bash
npm install
docker compose up -d db
npx prisma generate
npx prisma migrate dev
npm run dev
```

Health check:

- `http://localhost:3000/health`
- `http://localhost:3000/health/db`

## API Documentation

Development API: `http://localhost:3000`

OpenAPI spec: `http://localhost:3000/openapi.json`

Scalar API Reference: `http://localhost:3000/docs`

## Application Registry

Ravaa Service manages application identities for the Ravaa ecosystem:

- **Ravaa Drive** — File storage
- **Ravaa Office** — Collaborative editing
- **Ravaa Note + Todo** — Note-taking and task management

## Permission & Authorization

Three-layer authorization model:

```
Layer 1: Application Access
    └── User → Application → scopes[]

Layer 2: Application Scope
    └── drive:read, drive:write, etc.

Layer 3: Resource Permission
    └── Specific resource access control
```

### Permission Format

```
<resource>:<action>
```

Examples:
- `drive:read`
- `drive:write`
- `drive:delete`
- `office:read`
- `notes:write`

### Principal Types

- `USER` — Human user
- `APPLICATION` — Ravaa application
- `SYSTEM` — System-level access

## Admin & Seed Data

**Semua data user dipertahankan saat migrasi** (`ALTER TABLE` dengan default). Hanya `prisma migrate reset` yang menghapus, dan seed otomatis akan mengembalikan akun.

Seed default (`prisma/seed.ts`) idempotent — aman dijalankan berulang:

| Akun | Email | Username | Password | Role |
|------|-------|----------|----------|------|
| Admin | `admin@ravaa.my.id` | `admin` | `Secret123` | ADMIN |
| Demo | `demo@ravaa.my.id` | `demo` | `demo12345` | USER |

Sample apps juga di-seed: `ravaa-drive` (drive:read/write) + `ravaa-note` (notes:read/write), demo user sudah diberikan akses `drive:read/write`.

**Jalankan seed manual:**
```bash
npm run db:seed              # prisma db seed → tsx prisma/seed.ts
npx tsx scripts/seed-admin.ts # alternatif legacy, baca INITIAL_ADMIN_* dari .env
```

**Kustom admin via .env:**
```env
INITIAL_ADMIN_EMAIL=admin@yourdomain.com
INITIAL_ADMIN_PASSWORD=secure-password
INITIAL_ADMIN_USERNAME=admin
SEED_DEMO_USER=false          # skip demo user
SEED_SAMPLE_APPS=false        # skip sample apps
```

**Alur migrasi yang mempertahankan data:**
```bash
npx prisma migrate dev        # buat migrasi baru, data tetap ada
npm run db:seed               # hanya jika butuh refresh admin/demo
# vs
npx prisma migrate reset --force # hapus semua → seed otomatis jalan
```

> Login di `http://localhost:5173/login` dengan akun di atas. Admin bisa akses `/admin`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Run production build |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Type check without emitting |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run Prisma migrations (data dipertahankan) |
| `npm run db:migrate:prod` | Deploy migrations di production |
| `npm run db:seed` | Seed admin/demo/apps (idempotent) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:push` | Push schema to database |

## Environment Variables

See `.env.example` for required variables.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Hono
- **Database**: PostgreSQL 16
- **ORM**: Prisma 7
- **Validation**: Zod
- **Testing**: Vitest
- **API Docs**: OpenAPI 3.0 + Scalar

## Architecture Notes

- **Authentication** — JWT-based with refresh token rotation
- **Application Registry** — Client identity management
- **Authorization** — Generic permission foundation for all Ravaa apps
- **Resource Permissions** — Granular access control

**Ravaa Service is NOT yet a complete OAuth Authorization Server.**
