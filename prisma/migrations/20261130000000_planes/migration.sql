-- CreateEnum
CREATE TYPE "PlanKind" AS ENUM ('SIMPLE_QUEUE', 'PPPOE');

-- CreateEnum
CREATE TYPE "PlanCategory" AS ENUM ('RESIDENTIAL', 'CORPORATE');

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "burst" TEXT,
ADD COLUMN     "category" "PlanCategory" NOT NULL DEFAULT 'RESIDENTIAL',
ADD COLUMN     "kind" "PlanKind" NOT NULL DEFAULT 'SIMPLE_QUEUE',
ADD COLUMN     "pppProfile" TEXT,
ADD COLUMN     "priorityDown" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "priorityUp" INTEGER NOT NULL DEFAULT 8;

-- CreateIndex
CREATE INDEX "plans_tenantId_kind_idx" ON "plans"("tenantId", "kind");

