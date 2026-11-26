-- AlterTable
ALTER TABLE "routers" ADD COLUMN     "wgAddress" TEXT,
ADD COLUMN     "wgPrivateKeyEnc" TEXT,
ADD COLUMN     "wgPublicKey" TEXT;

-- CreateTable
CREATE TABLE "wireguard_servers" (
    "tenantId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 51820,
    "network" TEXT NOT NULL DEFAULT '10.200.0.0/24',
    "serverAddress" TEXT NOT NULL DEFAULT '10.200.0.1',
    "privateKeyEnc" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wireguard_servers_pkey" PRIMARY KEY ("tenantId")
);

-- AddForeignKey
ALTER TABLE "wireguard_servers" ADD CONSTRAINT "wireguard_servers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

