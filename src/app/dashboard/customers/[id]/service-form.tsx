'use client'

import { useState } from 'react'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { FormGrid, SelectField, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'
import { clientModeOptions } from '@/lib/labels'

type PlanOption = { value: string; label: string; kind: 'SIMPLE_QUEUE' | 'PPPOE' }

export function ServiceForm({
  action,
  plans,
  routers,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  plans: PlanOption[]
  routers: Array<{ value: string; label: string }>
}) {
  const [mode, setMode] = useState('PPPoE')
  if (plans.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Primero crea al menos un plan activo en <a href="/dashboard/plans" className="text-blue-700 underline">Planes</a>.
      </p>
    )
  }
  return (
    <ActionForm action={action} resetOnSuccess onSuccess={() => setMode('PPPoE')}>
      <FormGrid>
        <SelectField
          name="planId"
          label="Plan"
          required
          options={plans}
          placeholder="Elegir plan…"
          onChange={(e) => {
            // El tipo del plan sugiere el modo: PPPoE → usuario PPPoE; Simple Queue → IP fija.
            const kind = plans.find((p) => p.value === e.target.value)?.kind
            if (kind) setMode(kind === 'PPPOE' ? 'PPPoE' : 'STATIC_IP')
          }}
        />
        <SelectField name="routerId" label="Router" options={routers} placeholder="Sin router" />
        <SelectField name="mode" label="Modo de conexión" options={clientModeOptions} value={mode} onChange={(e) => setMode(e.target.value)} />
        <TextField name="pppoeUser" label="Usuario PPPoE" maxLength={100} hint={mode === 'PPPoE' ? 'El mismo de /ppp/secret' : undefined} />
        <TextField name="ipAddress" label="Dirección IP" placeholder="10.10.0.25" hint={mode !== 'PPPoE' ? 'La cola simple se crea para esta IP' : undefined} />
        <TextField name="macAddress" label="MAC" placeholder="AA:BB:CC:DD:EE:FF" />
      </FormGrid>
      <SubmitButton>Agregar servicio</SubmitButton>
    </ActionForm>
  )
}
