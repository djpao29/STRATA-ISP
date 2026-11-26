import { NextResponse } from 'next/server'
import { apiUser, jsonSafe, noStore } from '@/lib/monitoring/api-auth'
import { routerDetail } from '@/lib/monitoring/queries'

export const dynamic = 'force-dynamic'

/** Última muestra, interfaces y alertas de un router (desde la base). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await apiUser('monitoring')
  if (error) return error
  const detail = await routerDetail(user.tenantId, params.id)
  if (!detail) return NextResponse.json({ error: 'Router no encontrado' }, { status: 404 })
  return NextResponse.json(jsonSafe(detail), noStore)
}
