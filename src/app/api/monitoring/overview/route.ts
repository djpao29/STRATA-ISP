import { NextResponse } from 'next/server'
import { apiUser, jsonSafe, noStore } from '@/lib/monitoring/api-auth'
import { overview } from '@/lib/monitoring/queries'

export const dynamic = 'force-dynamic'

/** Estado de todos los MikroTik de la empresa (desde la base: no consulta los routers). */
export async function GET() {
  const { user, error } = await apiUser('monitoring')
  if (error) return error
  return NextResponse.json(jsonSafe(await overview(user.tenantId)), noStore)
}
