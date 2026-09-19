-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_notifications" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "language" TEXT DEFAULT 'en',
ADD COLUMN     "security_alerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "timezone" TEXT;
