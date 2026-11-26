import { prisma } from '@/lib/prisma'

/** Ajustes de monitoreo de la empresa (se crean con los valores por defecto la primera vez). */
export function getMonitoringSettings(tenantId: string) {
  return prisma.monitoringSettings.upsert({ where: { tenantId }, update: {}, create: { tenantId } })
}
