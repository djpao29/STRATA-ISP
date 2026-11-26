import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { formatCurrency, formatDate, formatDay, toNumber } from '@/lib/format'
import { CLIENT_MODE, CUSTOMER_STATUS, PAYMENT_METHOD } from '@/lib/labels'
import { addService, changeZone, deleteCustomer, deleteService, setCustomerStatus, toggleService } from '../actions'
import { manageAction } from '../../zones/actions'
import { ServiceForm } from './service-form'
import { ZoneSelectForm } from './zone-select-form'
import { localNow as localNowIn } from '@/lib/dates'
import { cycleInfo, lastCycleStart, nextCycleStart } from '@/lib/zones/cycle'
import { formatCustomerCode } from '@/lib/zones/billing'
import { formatDateTime } from '@/lib/format'

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser('customers')
  const customer = await prisma.customer.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    include: {
      services: { include: { plan: true, router: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
      invoices: { orderBy: { issueDate: 'desc' }, take: 12 },
      payments: { orderBy: { paidDate: 'desc' }, take: 12, include: { invoice: { select: { number: true } } } },
      tickets: { orderBy: { createdAt: 'desc' }, take: 10 },
      zone: true,
      networkActions: { orderBy: { createdAt: 'desc' }, take: 15, include: { router: { select: { name: true } } } },
      devices: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!customer) notFound()

  const local = localNowIn(user.tenant.timezone)
  const cycle = customer.zone ? cycleInfo(customer.zone, lastCycleStart(customer.zone, local)) : null
  const nextInvoice = customer.zone ? nextCycleStart(customer.zone, local) : null
  const zoneOptions = (
    await prisma.zone.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { invoiceDay: 'asc' } })
  ).map((z) => ({ value: z.id, label: z.name }))
  const zoneHistory = await prisma.auditLog.findMany({
    where: { tenantId: user.tenantId, entity: 'Customer', entityId: customer.id, action: 'customer.zone' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { user: { select: { name: true } } },
  })

  const canWrite = can(user.role, 'customersWrite')
  const currency = user.tenant.currency
  const pendingBalance = await prisma.invoice.aggregate({
    where: { customerId: customer.id, status: { in: ['PENDING', 'OVERDUE'] } },
    _sum: { amount: true },
  })

  const [plans, routers] = canWrite
    ? await Promise.all([
        prisma.plan.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { price: 'asc' } }),
        prisma.router.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' } }),
      ])
    : [[], []]

  return (
    <div className="space-y-6">
      <PageHeader title={`${customer.firstName} ${customer.lastName}`} description={`${formatCustomerCode(customer.code)} · Cédula/RUC ${customer.cedula}`}>
        {canWrite && (
          <Button asChild variant="outline">
            <Link href={`/dashboard/customers/${customer.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </Button>
        )}
        {can(user.role, 'billing') && (
          <Button asChild>
            <Link href={`/dashboard/billing/new?customerId=${customer.id}`}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva factura
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Datos del cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Info label="Estado">
                <StatusBadge value={customer.status} />
              </Info>
              <Info label="Teléfono">{customer.phone}</Info>
              <Info label="Correo">{customer.email ?? '—'}</Info>
              <Info label="Ciudad">{[customer.city, customer.neighborhood].filter(Boolean).join(' · ') || '—'}</Info>
              <Info label="Dirección">{customer.address ?? '—'}</Info>
              <Info label="Coordenadas">
                {customer.coordinates ? (
                  <a
                    className="text-blue-700 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.google.com/maps?q=${encodeURIComponent(customer.coordinates)}`}
                  >
                    {customer.coordinates}
                  </a>
                ) : (
                  '—'
                )}
              </Info>
              <Info label="Cliente desde">{formatDay(customer.createdAt, user.tenant.timezone)}</Info>
              {customer.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Notas</dt>
                  <dd className="whitespace-pre-line">{customer.notes}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saldo pendiente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-3xl font-bold">{formatCurrency(pendingBalance._sum.amount, currency)}</div>
            {canWrite && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Cambiar estado</p>
                <div className="flex flex-wrap gap-2">
                  {(['ACTIVE', 'SUSPENDED', 'CANCELLED'] as const)
                    .filter((s) => s !== customer.status)
                    .map((s) => (
                      <ActionButton
                        key={s}
                        action={setCustomerStatus}
                        fields={{ id: customer.id, status: s }}
                        variant="outline"
                        size="sm"
                        confirm={`¿Cambiar el estado a "${CUSTOMER_STATUS[s]}"?`}
                      >
                        {CUSTOMER_STATUS[s]}
                      </ActionButton>
                    ))}
                </div>
                <ActionButton
                  action={deleteCustomer}
                  fields={{ id: customer.id }}
                  variant="ghost"
                  size="sm"
                  className="text-red-600"
                  confirm="¿Eliminar este cliente? Solo es posible si no tiene facturas ni pagos."
                >
                  Eliminar cliente
                </ActionButton>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Zona de facturación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {customer.zone && cycle && nextInvoice ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-5">
              <Info label="Zona">
                <Link href={`/dashboard/zones/${customer.zone.id}`} className="font-medium text-blue-700 hover:underline">
                  {customer.zone.name}
                </Link>
              </Info>
              <Info label="Ciclo actual (factura)">{formatDate(cycle.cycleDate)}</Info>
              <Info label="Límite de pago">{formatDate(cycle.dueDate)}</Info>
              <Info label="Fecha de corte">{formatDate(cycle.suspendDate)}</Info>
              <Info label="Próxima factura">{formatDate(nextInvoice)}</Info>
            </dl>
          ) : (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Sin zona asignada: este cliente no se factura ni se corta automáticamente.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-4 text-sm">
            {canWrite && <ZoneSelectForm action={changeZone.bind(null, customer.id)} zones={zoneOptions} current={customer.zoneId} />}
            {customer.suspendExempt && <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-800">Exento de corte automático</span>}
            {customer.status === 'SUSPENDED' && (
              <span className="text-xs text-muted-foreground">
                Suspendido{' '}
                {customer.suspensionSource === 'AUTO'
                  ? 'automáticamente por falta de pago (se reconecta solo al pagar)'
                  : 'manualmente (reconectar con "Cambiar estado")'}
                {customer.suspendedAt && ` el ${formatDateTime(customer.suspendedAt, user.tenant.timezone)}`}
              </span>
            )}
            {customer.reconnectedAt && customer.status === 'ACTIVE' && (
              <span className="text-xs text-muted-foreground">
                Última reconexión: {formatDateTime(customer.reconnectedAt, user.tenant.timezone)}
              </span>
            )}
          </div>
          {zoneHistory.length > 0 && (
            <ul className="text-xs text-muted-foreground">
              {zoneHistory.map((h) => {
                const d = (h.details ?? {}) as { fromName?: string | null; toName?: string | null }
                return (
                  <li key={h.id}>
                    {formatDateTime(h.createdAt, user.tenant.timezone)}: {d.fromName ?? 'Sin zona'} → {d.toName ?? 'Sin zona'}
                    {h.user ? ` (por ${h.user.name})` : ''}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <DataTable
        title="Servicios"
        headers={['Plan', 'Velocidad', 'Precio', 'Modo', 'IP / PPPoE', 'Router', 'Estado', 'En el router', '']}
        rowCount={customer.services.length}
        emptyText="Sin servicios contratados."
      >
        {customer.services.map((s) => (
          <tr key={s.id}>
            <td className="font-medium">{s.plan.name}</td>
            <td>
              {s.plan.download}/{s.plan.upload} Mbps
            </td>
            <td>{formatCurrency(s.plan.price, currency)}</td>
            <td>{CLIENT_MODE[s.mode]}</td>
            <td>
              {s.ipAddress ?? '—'}
              {s.pppoeUser && <div className="text-xs text-muted-foreground">{s.pppoeUser}</div>}
            </td>
            <td>{s.router?.name ?? '—'}</td>
            <td>
              <StatusBadge value={s.isActive ? 'ACTIVE' : 'INACTIVE'} />
            </td>
            <td>
              {s.router ? (
                <span className={s.networkState === 'SUSPENDED' ? 'font-medium text-red-600' : 'text-green-700'}>
                  {s.networkState === 'SUSPENDED' ? 'Cortado' : 'Habilitado'}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Sin router</span>
              )}
            </td>
            <td className="space-x-1 text-right">
              {canWrite && (
                <>
                  <ActionButton action={toggleService} fields={{ id: s.id }} variant="outline" size="sm">
                    {s.isActive ? 'Desactivar' : 'Activar'}
                  </ActionButton>
                  <ActionButton
                    action={deleteService}
                    fields={{ id: s.id }}
                    variant="ghost"
                    size="sm"
                    className="text-red-600"
                    confirm="¿Eliminar este servicio?"
                  >
                    Eliminar
                  </ActionButton>
                </>
              )}
            </td>
          </tr>
        ))}
      </DataTable>

      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle>Agregar servicio</CardTitle>
          </CardHeader>
          <CardContent>
            <ServiceForm
              action={addService.bind(null, customer.id)}
              plans={plans.map((p) => ({ value: p.id, kind: p.kind, label: `${p.name} · ${p.kind === 'PPPOE' ? 'PPPoE' : 'Simple Queue'} · ${p.download}/${p.upload} Mbps · ${formatCurrency(p.price, currency)}` }))}
              routers={routers.map((r) => ({ value: r.id, label: `${r.name} (${r.host})` }))}
            />
          </CardContent>
        </Card>
      )}

      {can(user.role, 'devices') && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Wifi Router</CardTitle>
            <Link href={`/dashboard/customers/devices?customerId=${customer.id}`} className="text-sm text-blue-700 hover:underline">
              {customer.devices.length ? 'Ver claves y editar' : 'Registrar equipo'}
            </Link>
          </CardHeader>
          <CardContent>
            {customer.devices.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin equipos registrados.</p>
            ) : (
              <ul className="divide-y text-sm">
                {customer.devices.map((d) => (
                  <li key={d.id} className="flex flex-wrap gap-x-4 gap-y-1 py-2">
                    <span className="font-medium">{[d.brand, d.model].filter(Boolean).join(' ') || 'Equipo'}</span>
                    {d.ssid && <span>Red: {d.ssid}</span>}
                    {d.macAddress && <span className="font-mono text-xs">{d.macAddress}</span>}
                    {d.managementIp && <span className="font-mono text-xs">{d.managementIp}</span>}
                    {d.serial && <span className="text-muted-foreground">Serie {d.serial}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DataTable title="Últimas facturas" headers={['Número', 'Emisión', 'Vence', 'Monto', 'Estado']} rowCount={customer.invoices.length} emptyText="Sin facturas.">
          {customer.invoices.map((i) => (
            <tr key={i.id}>
              <td>
                <Link href={`/dashboard/billing/${i.id}`} className="font-medium text-blue-700 hover:underline">
                  {i.number}
                </Link>
              </td>
              <td>{formatDate(i.issueDate)}</td>
              <td>{formatDate(i.dueDate)}</td>
              <td>{formatCurrency(i.amount, currency)}</td>
              <td>
                <StatusBadge value={i.status} />
              </td>
            </tr>
          ))}
        </DataTable>

        <DataTable title="Últimos pagos" headers={['Fecha', 'Monto', 'Método', 'Factura', 'Estado']} rowCount={customer.payments.length} emptyText="Sin pagos.">
          {customer.payments.map((p) => (
            <tr key={p.id}>
              <td>{formatDate(p.paidDate)}</td>
              <td>{formatCurrency(toNumber(p.amount), currency)}</td>
              <td>{PAYMENT_METHOD[p.method]}</td>
              <td>{p.invoice?.number ?? '—'}</td>
              <td>
                <StatusBadge value={p.status} />
              </td>
            </tr>
          ))}
        </DataTable>
      </div>

      <DataTable title="Tickets de soporte" headers={['Título', 'Prioridad', 'Estado', 'Creado']} rowCount={customer.tickets.length} emptyText="Sin tickets.">
        {customer.tickets.map((t) => (
          <tr key={t.id}>
            <td>
              <Link href={`/dashboard/support/${t.id}`} className="font-medium text-blue-700 hover:underline">
                {t.title}
              </Link>
            </td>
            <td>
              <StatusBadge value={t.priority} />
            </td>
            <td>
              <StatusBadge value={t.status} />
            </td>
            <td>{formatDay(t.createdAt, user.tenant.timezone)}</td>
          </tr>
        ))}
      </DataTable>
      <DataTable
        title="Cortes y reconexiones"
        headers={['Fecha', 'Acción', 'Router', 'Estado', 'Detalle', '']}
        rowCount={customer.networkActions.length}
        emptyText="Sin cortes ni reconexiones registradas."
      >
        {customer.networkActions.map((a) => (
          <tr key={a.id}>
            <td>{formatDateTime(a.createdAt, user.tenant.timezone)}</td>
            <td>
              {a.type === 'SUSPEND' ? 'Corte' : 'Reconexión'} ({a.source === 'AUTO' ? 'automática' : 'manual'})
            </td>
            <td>{a.router?.name ?? '—'}</td>
            <td>
              {ACTION_STATUS[a.status]}
              {a.attempts > 1 && <span className="text-xs text-muted-foreground"> · {a.attempts} intentos</span>}
            </td>
            <td className="max-w-xs whitespace-normal text-xs">
              {a.reason}
              {a.lastError && <div className="text-red-600">{a.lastError}</div>}
            </td>
            <td className="text-right">
              {can(user.role, 'zonesWrite') && (a.status === 'FAILED' || a.status === 'PENDING') && (
                <ActionButton action={manageAction} fields={{ id: a.id, op: 'retry' }} variant="outline" size="sm">
                  Reintentar
                </ActionButton>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}

const ACTION_STATUS: Record<string, string> = {
  PENDING: 'Pendiente',
  RUNNING: 'Ejecutando',
  DONE: 'Aplicada',
  FAILED: 'Fallida',
  CANCELLED: 'Cancelada',
}
