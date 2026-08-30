-- CreateEnum
CREATE TYPE "PrincipalType" AS ENUM ('USER', 'APPLICATION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('allow', 'deny');

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_permissions" (
    "id" UUID NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "principal_type" "PrincipalType" NOT NULL,
    "principal_id" TEXT NOT NULL,
    "permission_id" UUID NOT NULL,
    "effect" "PermissionEffect" NOT NULL DEFAULT 'allow',
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "resource_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "permissions_resource_idx" ON "permissions"("resource");

-- CreateIndex
CREATE INDEX "permissions_action_idx" ON "permissions"("action");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_resource_action_key" ON "permissions"("resource", "action");

-- CreateIndex
CREATE INDEX "resource_permissions_resource_type_resource_id_idx" ON "resource_permissions"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "resource_permissions_principal_type_principal_id_idx" ON "resource_permissions"("principal_type", "principal_id");

-- CreateIndex
CREATE INDEX "resource_permissions_permission_id_idx" ON "resource_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_permissions_resource_type_resource_id_principal_ty_key" ON "resource_permissions"("resource_type", "resource_id", "principal_type", "principal_id", "permission_id");

-- AddForeignKey
ALTER TABLE "resource_permissions" ADD CONSTRAINT "resource_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
