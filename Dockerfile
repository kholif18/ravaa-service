# Ravaa Service — Hono + Prisma + PG
# Build: docker build -t ravaa-service .
FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++ libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig.json ./
COPY src ./src
ENV DATABASE_URL=postgresql://ravaa:ravaa_dev_password@localhost:5432/ravaa_service
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
EXPOSE 2711
CMD ["sh","-c","npx prisma migrate deploy && npx tsx prisma/seed.ts || true; node dist/index.js"]
