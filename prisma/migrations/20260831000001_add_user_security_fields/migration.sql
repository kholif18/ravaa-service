-- AlterTable: add security fields to users
ALTER TABLE "users" ADD COLUMN "recovery_email" TEXT;
ALTER TABLE "users" ADD COLUMN "recovery_phone" TEXT;
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "two_factor_secret" TEXT;
ALTER TABLE "users" ADD COLUMN "two_factor_backup_codes" TEXT[] NOT NULL DEFAULT '{}';
