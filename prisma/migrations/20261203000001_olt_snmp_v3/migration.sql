
-- AlterTable
ALTER TABLE "olts" ADD COLUMN     "snmpV3AuthKeyEnc" TEXT,
ADD COLUMN     "snmpV3AuthProto" TEXT,
ADD COLUMN     "snmpV3Level" TEXT,
ADD COLUMN     "snmpV3PrivKeyEnc" TEXT,
ADD COLUMN     "snmpV3PrivProto" TEXT,
ADD COLUMN     "snmpV3User" TEXT,
ADD COLUMN     "snmpVersion" TEXT NOT NULL DEFAULT '2c',
ADD COLUMN     "sysDescr" TEXT;

