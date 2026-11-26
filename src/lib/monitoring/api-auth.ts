import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { can, type Module } from '@/lib/permissions'

/** Usuario de la sesión para rutas de API (o una respuesta 401/403 lista para devolver). */
export async function apiUser(module: Module) {
  const session = await auth()
  const user = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, tenantId: true, role: true, isActive: true, tenant: { select: { isActive: true } } },
      })
    : null
  if (!user?.isActive || !user.tenant.isActive) return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  if (!can(user.role, module)) return { error: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) }
  return { user }
}

/** Convierte BigInt a número para poder enviarlo como JSON. */
export function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)))
}

export const noStore = { headers: { 'Cache-Control': 'no-store' } }
