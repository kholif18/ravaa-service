-- AlterTable
ALTER TABLE "users" ADD COLUMN     "storage_limit" BIGINT NOT NULL DEFAULT 5368709120,
ALTER COLUMN "status" SET DEFAULT 'active';
