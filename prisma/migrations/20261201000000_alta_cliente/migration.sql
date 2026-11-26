-- CreateEnum
CREATE TYPE "AccessType" AS ENUM ('FIBER', 'ANTENNA');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "email2" TEXT,
ADD COLUMN     "phone2" TEXT,
ADD COLUMN     "province" TEXT,
ALTER COLUMN "cedula" DROP NOT NULL;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "accessPoint" TEXT,
ADD COLUMN     "accessType" "AccessType",
ADD COLUMN     "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountNote" TEXT,
ADD COLUMN     "ipv6" TEXT,
ADD COLUMN     "lanInterface" TEXT,
ADD COLUMN     "pppoePasswordEnc" TEXT,
ADD COLUMN     "syncRouter" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "wanInterface" TEXT;

