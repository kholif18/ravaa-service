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
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:push` | Push schema to database |

## Environment Variables

See `.env.example` for required variables.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Hono
- **Database**: PostgreSQL 16
- **ORM**: Prisma
- **Validation**: Zod
- **Testing**: Vitest
