'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { FormGrid, SelectField, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'
import { clientModeOptions } from '@/lib/labels'

export function ServiceForm({
  action,
  plans,
  routers,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  plans: Array<{ value: string; label: string }>
  routers: Array<{ value: string; label: string }>
}) {
  if (plans.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Primero crea al menos un plan activo en <a href="/dashboard/plans" className="text-blue-700 underline">Planes</a>.
      </p>
    )
  }
  return (
    <ActionForm action={action} resetOnSuccess>
      <FormGrid>
        <SelectField name="planId" label="Plan" required options={plans} placeholder="Elegir plan…" />
        <SelectField name="routerId" label="Router" options={routers} placeholder="Sin router" />
        <SelectField name="mode" label="Modo de conexión" options={clientModeOptions} defaultValue="PPPoE" />
        <TextField name="pppoeUser" label="Usuario PPPoE" maxLength={100} />
        <TextField name="ipAddress" label="Dirección IP" placeholder="10.10.0.25" />
        <TextField name="macAddress" label="MAC" placeholder="AA:BB:CC:DD:EE:FF" />
      </FormGrid>
      <SubmitButton>Agregar servicio</SubmitButton>
    </ActionForm>
  )
}
