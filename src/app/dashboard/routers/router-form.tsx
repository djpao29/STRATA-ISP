'use client'

import type { RouterType } from '@prisma/client'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { CheckboxField, FormGrid, SelectField, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'
import { routerTypeOptions } from '@/lib/labels'

export function RouterForm({
  action,
  router,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  router?: {
    name: string
    host: string
    port: number
    username: string
    type: RouterType
    useHttps: boolean
    verifyTls: boolean
    monitoringEnabled: boolean
  }
  submitLabel: string
}) {
  return (
    <ActionForm action={action}>
      <FormGrid>
        <TextField name="name" label="Nombre" required defaultValue={router?.name} maxLength={100} />
        <SelectField name="type" label="Tipo" options={routerTypeOptions} defaultValue={router?.type ?? 'MIKROTIK'} />
        <TextField name="host" label="IP / host de administración" required defaultValue={router?.host} placeholder="10.0.0.1" />
        <TextField
          name="port"
          label="Puerto API REST"
          type="number"
          min={1}
          max={65535}
          defaultValue={router?.port ?? 443}
          hint="MikroTik RouterOS 7: 443 (servicio www-ssl) u 80 (servicio www)"
        />
        <TextField name="username" label="Usuario" required defaultValue={router?.username} autoComplete="off" />
        <TextField
          name="password"
          label="Contraseña"
          type="password"
          required={!router}
          autoComplete="new-password"
          hint={router ? 'Déjala vacía para conservar la actual' : 'Se guarda cifrada'}
        />
      </FormGrid>
      <div className="space-y-2 rounded-md border bg-gray-50 p-3">
        <CheckboxField name="useHttps" label="Usar HTTPS (recomendado)" defaultChecked={router?.useHttps ?? true} />
        <CheckboxField
          name="verifyTls"
          label="Validar el certificado TLS (desmárcalo si el MikroTik usa un certificado autofirmado en tu red privada)"
          defaultChecked={router?.verifyTls ?? false}
        />
        <CheckboxField name="monitoringEnabled" label="Incluir en el monitoreo automático" defaultChecked={router?.monitoringEnabled ?? true} />
      </div>
      <p className="text-xs text-muted-foreground">
        Para monitorear, crea en el MikroTik un usuario de solo lectura:{' '}
        <code className="rounded bg-gray-100 px-1">/user group add name=monitoreo policy=read,api,rest-api</code> y{' '}
        <code className="rounded bg-gray-100 px-1">/user add name=wispx group=monitoreo password=…</code>. No expongas el servicio www-ssl a
        internet: limítalo con <code className="rounded bg-gray-100 px-1">/ip service set www-ssl address=IP-del-servidor</code>.
      </p>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  )
}
