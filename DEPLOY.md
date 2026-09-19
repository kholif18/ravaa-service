# Deploy Ravaa Service (Home Server) — Docker

## 1. Clone & ENV
```bash
git clone git@github.com:kholif18/ravaa-service.git
cd ravaa-service
cp .env.example .env
# Edit .env: set JWT_SECRET (>=32char), SEED_DEMO_USER, SMTP jika butuh email
nano .env
```

## 2. Build & Run
```bash
docker compose up -d --build
docker compose logs -f api
```

## 3. Verifikasi
```bash
curl http://localhost:2711/health
curl http://localhost:2711/health/db
# Seed otomatis via migrate deploy. Cek admin:
# admin@ravaa.my.id / Secret123
```

## 4. Update
```bash
git pull
docker compose up -d --build
docker compose exec api npx prisma migrate deploy
```

## 5. Backup PG
```bash
docker compose exec db pg_dump -U ravaa ravaa_service > backup.sql
```

Env penting: `PORT=2711`, `DATABASE_URL` otomatis di compose, `JWT_SECRET`, `ACCOUNT_WEB_URL=http://<home-ip>:2712`.

Cloudflare Tunnel: `cloudflared tunnel --url http://localhost:2711` → `service.ravaa.my.id`.
