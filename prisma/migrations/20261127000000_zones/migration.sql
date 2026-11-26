-- CreateEnum
CREATE TYPE "NetworkState" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "NetworkActionType" AS ENUM ('SUSPEND', 'RECONNECT');

-- CreateEnum
CREATE TYPE "NetworkActionStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "code" INTEGER,
ADD COLUMN     "reconnectedAt" TIMESTAMP(3),
ADD COLUMN     "suspendExempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspensionSource" TEXT,
ADD COLUMN     "zoneId" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "suspendDate" TIMESTAMP(3),
ADD COLUMN     "zoneId" TEXT;

-- AlterTable
ALTER TABLE "routers" ADD COLUMN     "suspendList" TEXT NOT NULL DEFAULT 'morosos';

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "networkState" "NetworkState" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "networkStateAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "nextCustomerCode" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "invoiceDay" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "suspendDay" INTEGER NOT NULL,
    "invoiceHour" INTEGER NOT NULL DEFAULT 0,
    "suspendHour" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoInvoice" BOOLEAN NOT NULL DEFAULT true,
    "autoSuspend" BOOLEAN NOT NULL DEFAULT true,
    "autoReconnect" BOOLEAN NOT NULL DEFAULT true,
    "invoiceSuspended" BOOLEAN NOT NULL DEFAULT false,
    "suspendAfterInvoices" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_actions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "routerId" TEXT,
    "type" "NetworkActionType" NOT NULL,
    "status" "NetworkActionStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "method" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "network_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "summary" JSONB,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zones_tenantId_name_key" ON "zones"("tenantId", "name");

-- CreateIndex
CREATE INDEX "network_actions_status_nextAttemptAt_idx" ON "network_actions"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "network_actions_tenantId_createdAt_idx" ON "network_actions"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "job_runs_tenantId_startedAt_idx" ON "job_runs"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "customers_zoneId_idx" ON "customers"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenantId_code_key" ON "customers"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_actions" ADD CONSTRAINT "network_actions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_actions" ADD CONSTRAINT "network_actions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_actions" ADD CONSTRAINT "network_actions_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_actions" ADD CONSTRAINT "network_actions_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "routers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Datos iniciales ────────────────────────────────────────────
-- Zona 15: factura el 15, pago hasta el 15, corte el 20.
-- Zona 30: factura el 30, pago hasta el 30, corte el 5 del mes siguiente.
INSERT INTO "zones" ("id", "tenantId", "name", "invoiceDay", "dueDay", "suspendDay", "updatedAt")
SELECT 'zone15_' || t."id", t."id", 'Zona 15', 15, 15, 20, CURRENT_TIMESTAMP FROM "tenants" t
ON CONFLICT DO NOTHING;
INSERT INTO "zones" ("id", "tenantId", "name", "invoiceDay", "dueDay", "suspendDay", "updatedAt")
SELECT 'zone30_' || t."id", t."id", 'Zona 30', 30, 30, 5, CURRENT_TIMESTAMP FROM "tenants" t
ON CONFLICT DO NOTHING;

-- Código correlativo para los clientes existentes.
UPDATE "customers" c SET "code" = n.rn
FROM (SELECT "id", ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt") AS rn FROM "customers") n
WHERE c."id" = n."id";
UPDATE "tenants" t SET "nextCustomerCode" = COALESCE((SELECT MAX("code") FROM "customers" c WHERE c."tenantId" = t."id"), 0) + 1;
