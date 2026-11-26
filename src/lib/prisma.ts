import { PrismaClient } from '@prisma/client'

/**
 * Los comprobantes (hasta 5 MB) se guardan en la base de datos. Por defecto NUNCA se cargan en las
 * consultas: solo cuando se piden explícitamente con `select: { receiptData: true }`
 * (la ruta /api/files). Así las listas de pagos y gastos no traen archivos a memoria.
 */
function createClient() {
  return new PrismaClient({
    omit: {
      payment: { receiptData: true },
      expense: { receiptData: true },
    },
  })
}

type Client = ReturnType<typeof createClient>

// Reutiliza una sola instancia en desarrollo para no agotar conexiones con el hot reload.
const globalForPrisma = globalThis as unknown as { prisma?: Client }

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
