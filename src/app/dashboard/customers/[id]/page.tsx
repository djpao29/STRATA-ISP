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
import { addService, deleteCustomer, deleteService, setCustomerStatus, toggleService } from '../actions'
import { ServiceForm } from './service-form'

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser('customers')
  const customer = await prisma.customer.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    include: {
      services: { include: { plan: true, router: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
      invoices: { orderBy: { issueDate: 'desc' }, take: 12 },
      payments: { orderBy: { paidDate: 'desc' }, take: 12, include: { invoice: { select: { number: true } } } },
      tickets: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  })
  if (!customer) notFound()

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
      <PageHeader title={`${customer.firstName} ${customer.lastName}`} description={`Cédula/RUC ${customer.cedula}`}>
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

      <DataTable
        title="Servicios"
        headers={['Plan', 'Velocidad', 'Precio', 'Modo', 'IP / PPPoE', 'Router', 'Estado', '']}
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
              plans={plans.map((p) => ({ value: p.id, label: `${p.name} · ${formatCurrency(p.price, currency)}` }))}
              routers={routers.map((r) => ({ value: r.id, label: `${r.name} (${r.host})` }))}
            />
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
