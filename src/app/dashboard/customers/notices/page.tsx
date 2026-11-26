import type { NoticeSeverity } from '@prisma/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { ROLE_LABELS } from '@/lib/permissions'
import { formatDateTime } from '@/lib/format'
import { instantToLocalInput } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { deleteNotice, saveNotice, toggleNotice } from './actions'
import { NoticeForm } from './forms'

export const metadata = { title: 'Avisos en pantalla' }
export const dynamic = 'force-dynamic'

const SEVERITY: Record<NoticeSeverity, [string, string]> = {
  INFO: ['Información', 'bg-blue-100 text-blue-800'],
  WARNING: ['Advertencia', 'bg-amber-100 text-amber-800'],
  CRITICAL: ['Crítico', 'bg-red-100 text-red-800'],
}

export default async function NoticesPage() {
  const user = await requireUser('notices')
  const tz = user.tenant.timezone
  const now = new Date()
  const notices = await prisma.screenNotice.findMany({
    where: { tenantId: user.tenantId },
    orderBy: [{ isActive: 'desc' }, { startsAt: 'desc' }],
    take: 100,
    include: { createdBy: { select: { name: true } }, _count: { select: { dismissals: true } } },
  })
  const roles = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))

  const stateOf = (n: (typeof notices)[number]) => {
    if (!n.isActive) return ['Desactivado', 'bg-gray-100 text-gray-700']
    if (n.startsAt > now) return ['Programado', 'bg-blue-100 text-blue-800']
    if (n.endsAt && n.endsAt <= now) return ['Vencido', 'bg-gray-100 text-gray-700']
    return ['Visible ahora', 'bg-green-100 text-green-800']
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Avisos en pantalla" description="Mensajes para el personal que aparecen arriba de todas las pantallas del panel: cortes de red, cambios de horario, recordatorios internos." />

      <Card>
        <CardHeader>
          <CardTitle>Nuevo aviso</CardTitle>
        </CardHeader>
        <CardContent>
          <NoticeForm action={saveNotice.bind(null, null)} roles={roles} submitLabel="Publicar aviso" />
        </CardContent>
      </Card>

      {notices.length === 0 ? (
        <p className="rounded-md border bg-white py-10 text-center text-sm text-muted-foreground">Todavía no hay avisos.</p>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => {
            const [state, stateCls] = stateOf(n)
            const [sev, sevCls] = SEVERITY[n.severity]
            return (
              <Card key={n.id}>
                <CardContent className="space-y-2 pt-6 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{n.title}</span>
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', sevCls)}>{sev}</span>
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', stateCls)}>{state}</span>
                      </div>
                      <p className="whitespace-pre-line">{n.message}</p>
                    </div>
                    <div className="flex gap-1">
                      <ActionButton action={toggleNotice} fields={{ id: n.id }} variant="outline" size="sm">
                        {n.isActive ? 'Desactivar' : 'Activar'}
                      </ActionButton>
                      <ActionButton action={deleteNotice} fields={{ id: n.id }} variant="outline" size="sm" confirm="¿Eliminar este aviso?">
                        Eliminar
                      </ActionButton>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {n.roles.length ? n.roles.map((r) => ROLE_LABELS[r]).join(', ') : 'Todo el personal'} · desde {formatDateTime(n.startsAt, tz)}
                    {n.endsAt ? ` hasta ${formatDateTime(n.endsAt, tz)}` : ' sin fecha de fin'}
                    {n.dismissible ? ` · ocultado por ${n._count.dismissals} usuario(s)` : ' · no se puede ocultar'}
                    {n.createdBy && ` · ${n.createdBy.name}`}
                  </p>
                  <details>
                    <summary className="cursor-pointer text-blue-700">Editar</summary>
                    <div className="mt-3">
                      <NoticeForm
                        action={saveNotice.bind(null, n.id)}
                        roles={roles}
                        submitLabel="Guardar cambios"
                        values={{
                          title: n.title,
                          message: n.message,
                          severity: n.severity,
                          roles: n.roles,
                          startsAt: instantToLocalInput(n.startsAt, tz),
                          endsAt: n.endsAt ? instantToLocalInput(n.endsAt, tz) : '',
                          dismissible: n.dismissible,
                        }}
                      />
                    </div>
                  </details>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
