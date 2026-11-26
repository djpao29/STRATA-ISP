'use client'

import type { RouterType } from '@prisma/client'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { FormGrid, SelectField, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'
import { routerTypeOptions } from '@/lib/labels'

export function RouterForm({
  action,
  router,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  router?: { name: string; host: string; port: number; username: string; type: RouterType }
  submitLabel: string
}) {
  return (
    <ActionForm action={action}>
      <FormGrid>
        <TextField name="name" label="Nombre" required defaultValue={router?.name} maxLength={100} />
        <SelectField name="type" label="Tipo" options={routerTypeOptions} defaultValue={router?.type ?? 'MIKROTIK'} />
        <TextField name="host" label="IP / host" required defaultValue={router?.host} placeholder="10.0.0.1" />
        <TextField
          name="port"
          label="Puerto API"
          type="number"
          min={1}
          max={65535}
          defaultValue={router?.port ?? 8728}
          hint="MikroTik: 8728 (API) u 8729 (API-SSL)"
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
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  )
}
