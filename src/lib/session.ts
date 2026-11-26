import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { can, type Module } from '@/lib/permissions'

/**
 * Usuario actual leído de la base (no solo del token), para que desactivar a alguien
 * o cambiarle el rol tenga efecto inmediato. Se cachea por petición.
 */
export const currentUser = cache(async () => {
  const session = await auth()
  if (!session?.user?.id) return null
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, tenantId: true, isActive: true, tenant: { select: { isActive: true, currency: true, name: true, timezone: true } } },
  })
  if (!user || !user.isActive || !user.tenant.isActive) return null
  return user
})

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>

/**
 * Exige sesión y, opcionalmente, permiso sobre un módulo.
 * Sin sesión manda al login; sin permiso responde 404 para no revelar la ruta.
 */
export async function requireUser(module?: Module): Promise<CurrentUser> {
  const user = await currentUser()
  if (!user) redirect('/auth/login')
  if (module && !can(user.role, module)) notFound()
  return user
}

/** Para Server Actions: lanza un error con mensaje en vez de redirigir. */
export async function requireActionUser(module: Module): Promise<CurrentUser> {
  const user = await currentUser()
  if (!user) throw new Error('Sesión expirada. Vuelve a iniciar sesión.')
  if (!can(user.role, module)) throw new Error('No tienes permiso para esta acción.')
  return user
}
