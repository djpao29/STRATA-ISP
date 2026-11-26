-- CreateEnum
CREATE TYPE "InterfaceRole" AS ENUM ('WAN', 'LAN', 'OTHER');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- AlterEnum
ALTER TYPE "RouterStatus" ADD VALUE 'DEGRADED';

-- AlterTable
ALTER TABLE "routers" ADD COLUMN     "failCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "identity" TEXT,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "latencyMs" INTEGER,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "monitoringEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "osVersion" TEXT,
ADD COLUMN     "useHttps" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "verifyTls" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "port" SET DEFAULT 443;

-- CreateTable
CREATE TABLE "router_metrics" (
    "id" TEXT NOT NULL,
    "routerId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latencyMs" INTEGER NOT NULL,
    "cpuLoad" INTEGER NOT NULL,
    "memUsed" BIGINT NOT NULL,
    "memTotal" BIGINT NOT NULL,
    "hddUsed" BIGINT NOT NULL,
    "hddTotal" BIGINT NOT NULL,
    "temperature" DOUBLE PRECISION,
    "voltage" DOUBLE PRECISION,
    "uptimeSec" INTEGER NOT NULL,
    "pppActive" INTEGER,
    "wanRxBps" BIGINT,
    "wanTxBps" BIGINT,

    CONSTRAINT "router_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "router_interfaces" (
    "id" TEXT NOT NULL,
    "routerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "comment" TEXT,
    "role" "InterfaceRole" NOT NULL DEFAULT 'OTHER',
    "isSfp" BOOLEAN NOT NULL DEFAULT false,
    "monitored" BOOLEAN NOT NULL DEFAULT false,
    "alertOnDown" BOOLEAN NOT NULL DEFAULT false,
    "running" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "rxBytes" BIGINT NOT NULL DEFAULT 0,
    "txBytes" BIGINT NOT NULL DEFAULT 0,
    "rxBps" BIGINT NOT NULL DEFAULT 0,
    "txBps" BIGINT NOT NULL DEFAULT 0,
    "sampledAt" TIMESTAMP(3),
    "missing" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "router_interfaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interface_samples" (
    "id" TEXT NOT NULL,
    "interfaceId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rxBps" BIGINT NOT NULL,
    "txBps" BIGINT NOT NULL,

    CONSTRAINT "interface_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_settings" (
    "tenantId" TEXT NOT NULL,
    "pollIntervalSec" INTEGER NOT NULL DEFAULT 60,
    "liveRefreshSec" INTEGER NOT NULL DEFAULT 5,
    "requestTimeoutSec" INTEGER NOT NULL DEFAULT 8,
    "cpuThreshold" INTEGER NOT NULL DEFAULT 85,
    "memThreshold" INTEGER NOT NULL DEFAULT 90,
    "tempThreshold" INTEGER NOT NULL DEFAULT 70,
    "latencyThreshold" INTEGER NOT NULL DEFAULT 1500,
    "offlineAfterFails" INTEGER NOT NULL DEFAULT 2,
    "retentionDays" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitoring_settings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "monitor_alerts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routerId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "message" TEXT NOT NULL,
    "value" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "monitor_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "router_metrics_routerId_at_idx" ON "router_metrics"("routerId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "router_interfaces_routerId_name_key" ON "router_interfaces"("routerId", "name");

-- CreateIndex
CREATE INDEX "interface_samples_interfaceId_at_idx" ON "interface_samples"("interfaceId", "at");

-- CreateIndex
CREATE INDEX "monitor_alerts_tenantId_status_idx" ON "monitor_alerts"("tenantId", "status");

-- CreateIndex
CREATE INDEX "monitor_alerts_routerId_key_status_idx" ON "monitor_alerts"("routerId", "key", "status");

-- AddForeignKey
ALTER TABLE "router_metrics" ADD CONSTRAINT "router_metrics_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "routers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "router_interfaces" ADD CONSTRAINT "router_interfaces_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "routers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interface_samples" ADD CONSTRAINT "interface_samples_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "router_interfaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_settings" ADD CONSTRAINT "monitoring_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitor_alerts" ADD CONSTRAINT "monitor_alerts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitor_alerts" ADD CONSTRAINT "monitor_alerts_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "routers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Los routers registrados usaban el puerto 8728 (API binaria); el monitoreo usa la API REST (HTTPS 443).
UPDATE "routers" SET "port" = 443 WHERE "port" = 8728;
