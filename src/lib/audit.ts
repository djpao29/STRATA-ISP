import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/** Registra quién hizo qué. Nunca debe romper la acción principal. */
export async function audit(params: {
  tenantId: string
  userId?: string
  action: string
  entity: string
  entityId?: string
  details?: Prisma.InputJsonValue
}) {
  try {
    await prisma.auditLog.create({ data: params })
  } catch (error) {
    console.error('No se pudo registrar la auditoría', error)
  }
}
