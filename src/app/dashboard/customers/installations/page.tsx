import Link from 'next/link'
import type { InstallationStatus, Prisma } from '@prisma/client'
import { MapPin, Phone } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { ROLE_LABELS } from '@/lib/permissions'
import { formatDateTime } from '@/lib/format'
import { instantToLocalInput, localInputToInstant, todayIn } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { completeInstallation, scheduleInstallation, setInstallationStatus, updateInstallation } from './actions'
import { InstallationActions, ScheduleForm } from './forms'

export const metadata = { title: 'Instalaciones' }

const STATUS: Record<InstallationStatus, [string, string]> = {
  SCHEDULED: ['Programada', 'bg-blue-100 text-blue-800'],
  IN_PROGRESS: ['En curso', 'bg-amber-100 text-amber-800'],
  DONE: ['Completada', 'bg-green-100 text-green-800'],
  CANCELLED: ['Cancelada', 'bg-gray-100 text-gray-700'],
}
const VIEWS = [
  { key: 'open', label: 'Pendientes' },
  { key: 'today', label: 'Hoy' },
  { key: 'late', label: 'Atrasadas' },
  { key: 'done', label: 'Completadas' },
  { key: 'cancelled', label: 'Canceladas' },
] as const

type Props = { searchParams: { view?: string; mine?: string } }

export default async function InstallationsPage({ searchParams }: Props) {
  const user = await requireUser('installations')
  const tz = user.tenant.timezone
  const view = VIEWS.some((v) => v.key === searchParams.view) ? searchParams.view! : 'open'
  const mine = searchParams.mine === '1' || (user.role === 'TECHNICIAN' && searchParams.mine !== '0')

  // Inicio y fin de "hoy" en la hora local de la empresa, como instantes reales.
  const todayLocal = todayIn(tz)
  const dayStart = localInputToInstant(`${todayLocal.toISOString().slice(0, 10)}T00:00`, tz)
  const dayEnd = new Date(dayStart.getTime() + 86_400_000)
  const open: InstallationStatus[] = ['SCHEDULED', 'IN_PROGRESS']

  const where: Prisma.InstallationWhereInput = {
    tenantId: user.tenantId,
    ...(mine ? { technicianId: user.id } : {}),
    ...(view === 'open' && { status: { in: open } }),
    ...(view === 'today' && { status: { in: open }, scheduledAt: { gte: dayStart, lt: dayEnd } }),
    ...(view === 'late' && { status: { in: open }, scheduledAt: { lt: dayStart } }),
    ...(view === 'done' && { status: 'DONE' }),
    ...(view === 'cancelled' && { status: 'CANCELLED' }),
  }

  const [installations, counts, pendingCustomers, technicians] = await Promise.all([
    prisma.installation.findMany({
      where,
      orderBy: { scheduledAt: view === 'done' || view === 'cancelled' ? 'desc' : 'asc' },
      take: 200,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true, address: true, city: true, neighborhood: true, coordinates: true, status: true } },
        technician: { select: { name: true } },
      },
    }),
    Promise.all([
      prisma.installation.count({ where: { tenantId: user.tenantId, status: { in: open } } }),
      prisma.installation.count({ where: { tenantId: user.tenantId, status: { in: open }, scheduledAt: { gte: dayStart, lt: dayEnd } } }),
      prisma.installation.count({ where: { tenantId: user.tenantId, status: { in: open }, scheduledAt: { lt: dayStart } } }),
    ]),
    prisma.customer.findMany({
      where: { tenantId: user.tenantId, status: { in: ['PENDING', 'ACTIVE', 'SUSPENDED'] }, installations: { none: { status: { in: open } } } },
      orderBy: [{ status: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, status: true, cedula: true },
    }),
    prisma.user.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, role: true } }),
  ])
  const techOptions = technicians.map((t) => ({ value: t.id, label: `${t.name} (${ROLE_LABELS[t.role]})` }))
  const tomorrow9 = instantToLocalInput(new Date(dayEnd.getTime() + 9 * 3_600_000), tz)

  // Agrupar por día local.
  const groups = new Map<string, typeof installations>()
  for (const i of installations) {
    const key = new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(i.scheduledAt)
    groups.set(key, [...(groups.get(key) ?? []), i])
  }
  const qs = (patch: Record<string, string>) => {
    const sp = new URLSearchParams({ view, ...(mine ? { mine: '1' } : user.role === 'TECHNICIAN' ? { mine: '0' } : {}), ...patch })
    return `/dashboard/customers/installations?${sp.toString()}`
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Instalaciones" description="Agenda de instalaciones. Al completar, el cliente pendiente pasa a activo." />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {VIEWS.map((v, idx) => (
          <Link key={v.key} href={qs({ view: v.key })} className={cn('rounded-full border px-3 py-1', view === v.key && 'border-blue-600 bg-blue-50 text-blue-700')}>
            {v.label}
            {idx < 3 && ` (${counts[idx]})`}
          </Link>
        ))}
        <span className="mx-2 text-muted-foreground">|</span>
        <Link href={qs({ mine: mine ? '0' : '1' })} className={cn('rounded-full border px-3 py-1', mine && 'border-blue-600 bg-blue-50 text-blue-700')}>
          Solo mis instalaciones
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Programar instalación</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todos los clientes ya tienen una instalación abierta.</p>
          ) : (
            <ScheduleForm
              action={scheduleInstallation}
              defaultAt={tomorrow9}
              technicians={techOptions}
              customers={pendingCustomers.map((c) => ({
                value: c.id,
                label: `${c.lastName} ${c.firstName}${c.cedula ? ` · ${c.cedula}` : ''}${c.status === 'PENDING' ? ' · POR INSTALAR' : ''}`,
              }))}
            />
          )}
        </CardContent>
      </Card>

      {installations.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No hay instalaciones en esta vista.</CardContent>
        </Card>
      ) : (
        [...groups.entries()].map(([day, list]) => (
          <div key={day} className="space-y-2">
            <h2 className="text-sm font-semibold capitalize text-gray-700">{day}</h2>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {list.map((i) => {
                const late = (i.status === 'SCHEDULED' || i.status === 'IN_PROGRESS') && i.scheduledAt < dayStart
                const address = [i.customer.address, i.customer.neighborhood, i.customer.city].filter(Boolean).join(', ')
                return (
                  <Card key={i.id} className={late ? 'border-red-200' : ''}>
                    <CardContent className="space-y-2 pt-5 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Link href={`/dashboard/customers/${i.customer.id}`} className="font-semibold text-blue-700 hover:underline">
                            {i.customer.firstName} {i.customer.lastName}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {formatDateTime(i.scheduledAt, tz)} · {i.technician?.name ?? 'sin técnico'}
                            {late && <span className="font-semibold text-red-600"> · atrasada</span>}
                          </div>
                        </div>
                        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS[i.status][1])}>{STATUS[i.status][0]}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <a href={`tel:${i.customer.phone}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                          <Phone className="h-3 w-3" /> {i.customer.phone}
                        </a>
                        {address && <span>{address}</span>}
                        {i.customer.coordinates && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(i.customer.coordinates)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                          >
                            <MapPin className="h-3 w-3" /> Cómo llegar
                          </a>
                        )}
                      </div>
                      {i.notes && <p className="whitespace-pre-line rounded bg-gray-50 px-2 py-1 text-xs">{i.notes}</p>}
                      {i.completionNotes && <p className="whitespace-pre-line rounded bg-green-50 px-2 py-1 text-xs">Cierre: {i.completionNotes}</p>}
                      {i.completedAt && <p className="text-xs text-muted-foreground">Completada {formatDateTime(i.completedAt, tz)}</p>}
                      {(i.status === 'SCHEDULED' || i.status === 'IN_PROGRESS') && (
                        <div className="flex flex-wrap items-start gap-1 pt-1">
                          <InstallationActions
                            update={updateInstallation.bind(null, i.id)}
                            complete={completeInstallation.bind(null, i.id)}
                            technicians={techOptions}
                            scheduledAt={instantToLocalInput(i.scheduledAt, tz)}
                            technicianId={i.technicianId}
                            notes={i.notes}
                          />
                          {i.status === 'SCHEDULED' && (
                            <ActionButton action={setInstallationStatus} fields={{ id: i.id, status: 'IN_PROGRESS' }} variant="outline" size="sm">
                              En camino
                            </ActionButton>
                          )}
                          <ActionButton action={setInstallationStatus} fields={{ id: i.id, status: 'CANCELLED' }} variant="ghost" size="sm" className="text-red-600" confirm="¿Cancelar esta instalación?">
                            Cancelar
                          </ActionButton>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
