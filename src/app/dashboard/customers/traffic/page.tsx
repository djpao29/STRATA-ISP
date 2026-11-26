import { PageHeader } from '@/components/app/page-header'
import { requireUser } from '@/lib/session'
import { TrafficClient } from './traffic-client'

export const metadata = { title: 'Tráfico de clientes' }

export default async function CustomerTrafficPage() {
  await requireUser('monitoring')
  return (
    <div className="space-y-6">
      <PageHeader
        title="Tráfico de clientes"
        description="Conexión, velocidad actual y consumo de cada cliente, leídos de tus MikroTik (solo lectura)"
      />
      <TrafficClient />
    </div>
  )
}
