# ─── Stage 1: Build ────────────────────────────────────────────────────────────

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY prisma ./prisma/
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src/

RUN npx tsc

# ─── Stage 2: Production ──────────────────────────────────────────────────────

FROM node:22-alpine AS runner

WORKDIR /app

RUN addgroup -g 1001 -S ravaa && \
    adduser -S ravaa -u 1001 -G ravaa

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma/
COPY --from=builder /app/dist ./dist/

USER ravaa

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
