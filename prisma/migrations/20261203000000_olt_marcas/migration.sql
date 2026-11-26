-- CreateEnum
CREATE TYPE "PonType" AS ENUM ('GPON', 'EPON', 'GPON_EPON');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OltBrand" ADD VALUE 'HIOSO';
ALTER TYPE "OltBrand" ADD VALUE 'CDATA';
ALTER TYPE "OltBrand" ADD VALUE 'BDCOM';

-- AlterTable
ALTER TABLE "olts" ADD COLUMN     "autofindTemplate" TEXT,
ADD COLUMN     "ponType" "PonType" NOT NULL DEFAULT 'GPON',
ADD COLUMN     "readTemplate" TEXT,
ADD COLUMN     "softwareVersion" TEXT;
