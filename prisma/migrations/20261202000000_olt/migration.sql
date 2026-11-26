-- CreateEnum
CREATE TYPE "OltBrand" AS ENUM ('HUAWEI', 'ZTE', 'VSOL');

-- CreateEnum
CREATE TYPE "CliProtocol" AS ENUM ('TELNET', 'SSH');

-- CreateEnum
CREATE TYPE "OnuAuthState" AS ENUM ('AUTHORIZED', 'PREAUTHORIZED', 'PENDING', 'FAILED');

-- CreateEnum
CREATE TYPE "PonEventKind" AS ENUM ('SIGNAL_VARIATION', 'POWER_OFF', 'LOS', 'PON_DOWN', 'OFFLINE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ONUStatus" ADD VALUE 'POWER_OFF';
ALTER TYPE "ONUStatus" ADD VALUE 'OFFLINE';
ALTER TYPE "ONUStatus" ADD VALUE 'UNKNOWN';

-- AlterTable
ALTER TABLE "olts" ADD COLUMN     "authTemplate" TEXT,
ADD COLUMN     "brand" "OltBrand" NOT NULL DEFAULT 'HUAWEI',
ADD COLUMN     "cliPasswordEnc" TEXT,
ADD COLUMN     "cliPort" INTEGER NOT NULL DEFAULT 23,
ADD COLUMN     "cliProtocol" "CliProtocol" NOT NULL DEFAULT 'TELNET',
ADD COLUMN     "cliUsername" TEXT,
ADD COLUMN     "coordinates" TEXT,
ADD COLUMN     "defaultVlan" INTEGER,
ADD COLUMN     "enablePasswordEnc" TEXT,
ADD COLUMN     "frame" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastPollAt" TIMESTAMP(3),
ADD COLUMN     "lineProfile" TEXT,
ADD COLUMN     "pollEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "srvProfile" TEXT,
ADD COLUMN     "temperature" DOUBLE PRECISION,
ADD COLUMN     "uptimeSec" INTEGER;

-- AlterTable
ALTER TABLE "onus" ADD COLUMN     "authError" TEXT,
ADD COLUMN     "authState" "OnuAuthState" NOT NULL DEFAULT 'AUTHORIZED',
ADD COLUMN     "authorizedAt" TIMESTAMP(3),
ADD COLUMN     "inOlt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "napBoxId" TEXT,
ADD COLUMN     "napPort" INTEGER,
ADD COLUMN     "onuModelId" TEXT,
ADD COLUMN     "prevRxPower" DOUBLE PRECISION,
ADD COLUMN     "rxPower" DOUBLE PRECISION,
ADD COLUMN     "speedPlanId" TEXT,
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "txPower" DOUBLE PRECISION,
ADD COLUMN     "vlan" INTEGER;

-- CreateTable
CREATE TABLE "onu_models" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" "OltBrand",
    "oltType" TEXT,
    "ethPorts" INTEGER NOT NULL DEFAULT 1,
    "potsPorts" INTEGER NOT NULL DEFAULT 0,
    "wifi" BOOLEAN NOT NULL DEFAULT false,
    "catv" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onu_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "olt_speed_plans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "download" INTEGER NOT NULL,
    "upload" INTEGER NOT NULL,
    "lineProfile" TEXT,
    "srvProfile" TEXT,
    "vlan" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "olt_speed_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nap_boxes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coordinates" TEXT,
    "address" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 8,
    "splitter" TEXT,
    "oltId" TEXT,
    "ponSlot" INTEGER,
    "ponPort" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nap_boxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onu_discoveries" (
    "id" TEXT NOT NULL,
    "oltId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "port" INTEGER NOT NULL,
    "equipment" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "onu_discoveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pon_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "oltId" TEXT NOT NULL,
    "onuId" TEXT,
    "kind" "PonEventKind" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "pon_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "olt_settings" (
    "tenantId" TEXT NOT NULL,
    "lowSignal" DOUBLE PRECISION NOT NULL DEFAULT -27,
    "criticalSignal" DOUBLE PRECISION NOT NULL DEFAULT -29,
    "variationDb" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "pollMinutes" INTEGER NOT NULL DEFAULT 5,
    "autoAuthorize" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "olt_settings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE UNIQUE INDEX "onu_models_tenantId_name_key" ON "onu_models"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "olt_speed_plans_tenantId_name_key" ON "olt_speed_plans"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "nap_boxes_tenantId_name_key" ON "nap_boxes"("tenantId", "name");

-- CreateIndex
CREATE INDEX "onu_discoveries_oltId_active_idx" ON "onu_discoveries"("oltId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "onu_discoveries_oltId_serial_key" ON "onu_discoveries"("oltId", "serial");

-- CreateIndex
CREATE INDEX "pon_events_tenantId_resolvedAt_idx" ON "pon_events"("tenantId", "resolvedAt");

-- CreateIndex
CREATE INDEX "pon_events_oltId_kind_resolvedAt_idx" ON "pon_events"("oltId", "kind", "resolvedAt");

-- AddForeignKey
ALTER TABLE "onus" ADD CONSTRAINT "onus_onuModelId_fkey" FOREIGN KEY ("onuModelId") REFERENCES "onu_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onus" ADD CONSTRAINT "onus_speedPlanId_fkey" FOREIGN KEY ("speedPlanId") REFERENCES "olt_speed_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onus" ADD CONSTRAINT "onus_napBoxId_fkey" FOREIGN KEY ("napBoxId") REFERENCES "nap_boxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onu_models" ADD CONSTRAINT "onu_models_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "olt_speed_plans" ADD CONSTRAINT "olt_speed_plans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nap_boxes" ADD CONSTRAINT "nap_boxes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nap_boxes" ADD CONSTRAINT "nap_boxes_oltId_fkey" FOREIGN KEY ("oltId") REFERENCES "olts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onu_discoveries" ADD CONSTRAINT "onu_discoveries_oltId_fkey" FOREIGN KEY ("oltId") REFERENCES "olts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pon_events" ADD CONSTRAINT "pon_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pon_events" ADD CONSTRAINT "pon_events_oltId_fkey" FOREIGN KEY ("oltId") REFERENCES "olts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pon_events" ADD CONSTRAINT "pon_events_onuId_fkey" FOREIGN KEY ("onuId") REFERENCES "onus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "olt_settings" ADD CONSTRAINT "olt_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

