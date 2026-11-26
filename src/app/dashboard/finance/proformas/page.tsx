import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatCurrency, formatDate } from '@/lib/format'
import { todayIn } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { PROFORMA_STATUS } from './status'

export const metadata = { title: 'Proformas' }


export default async function ProformasPage() {
  const user = await requireUser('finance')
  const today = todayIn(user.tenant.timezone)
  const proformas = await prisma.proforma.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { customer: { select: { firstName: true, lastName: true } }, invoice: { select: { id: true, number: true } } },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Proformas" description="Cotizaciones sin valor fiscal que se convierten en factura cuando el cliente acepta">
        <Button asChild>
          <Link href="/dashboard/finance/proformas/new">
            <Plus className="mr-2 h-4 w-4" />
            Nueva proforma
          </Link>
        </Button>
      </PageHeader>
      <Card>
        <CardContent className="pt-6">
          {proformas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay proformas.</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Cliente</th>
                    <th>Emisión</th>
                    <th>Válida hasta</th>
                    <th>Total</th>
                    <th>Estado</th>
                    <th>Factura</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {proformas.map((p) => {
                    const expired = p.validUntil < today && (p.status === 'DRAFT' || p.status === 'SENT')
                    return (
                      <tr key={p.id}>
                        <td>
                          <Link href={`/dashboard/finance/proformas/${p.id}`} className="font-medium text-blue-700 hover:underline">{p.number}</Link>
                        </td>
                        <td>{p.customer ? `${p.customer.firstName} ${p.customer.lastName}` : <span>{p.clientName} <span className="text-xs text-muted-foreground">(prospecto)</span></span>}</td>
                        <td>{formatDate(p.issueDate)}</td>
                        <td className={expired ? 'text-red-600' : ''}>{formatDate(p.validUntil)}{expired && ' (vencida)'}</td>
                        <td className="font-medium">{formatCurrency(p.total, user.tenant.currency)}</td>
                        <td>
                          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', PROFORMA_STATUS[p.status][1])}>{PROFORMA_STATUS[p.status][0]}</span>
                        </td>
                        <td>{p.invoice ? <Link href={`/dashboard/billing/${p.invoice.id}`} className="text-blue-700 hover:underline">{p.invoice.number}</Link> : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
