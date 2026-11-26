import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SelectField, TextField } from '@/components/forms/fields'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { getOltSettings } from '@/lib/olt/service'
import { preauthorizeOnu } from '../../actions'
import { InlineForm, OnuLinkFields } from '../../forms'
import { onuOptions } from '../../options'

export const metadata = { title: 'Pre-autorizar ONU' }

export default async function PreauthorizePage() {
  const user = await requireUser('olt')
  const [opts, settings, waiting] = await Promise.all([
    onuOptions(user.tenantId),
    getOltSettings(user.tenantId),
    prisma.oNU.count({ where: { olt: { tenantId: user.tenantId }, authState: 'PREAUTHORIZED' } }),
  ])
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Pre-autorizar ONU"
        description="Registra el serial antes de instalarla: cuando la OLT la detecte, se autoriza sola con estos datos."
      />
      {!settings.autoAuthorize && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          La autorización automática está desactivada en Alertas: las pre-autorizadas quedarán en «Pendientes» para autorizarlas a mano.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Nueva pre-autorización</CardTitle>
        </CardHeader>
        <CardContent>
          {opts.olts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Registra primero una OLT.</p>
          ) : (
            <InlineForm action={preauthorizeOnu} submitLabel="Pre-autorizar">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <TextField name="serial" label="Serial (GPON) o MAC (EPON)" required placeholder="HWTC1A2B3C4D o 00:1E:A5:11:22:33" className="[&_input]:font-mono [&_input]:uppercase" />
                <SelectField name="oltId" label="OLT" required options={opts.olts} defaultValue={opts.olts[0]?.value} />
              </div>
              <OnuLinkFields {...opts} />
            </InlineForm>
          )}
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        {waiting} ONU(s) esperando ser detectadas. Míralas en <a href="/dashboard/olt/onus/pending" className="text-blue-700 hover:underline">Pendientes</a>.
      </p>
    </div>
  )
}
