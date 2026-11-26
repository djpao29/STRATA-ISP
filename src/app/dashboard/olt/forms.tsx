'use client'

import type { OLTStatus } from '@prisma/client'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { FormGrid, SelectField, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>

const oltStatusOptions = [
  { value: 'UNKNOWN', label: 'Sin verificar' },
  { value: 'ONLINE', label: 'En línea' },
  { value: 'OFFLINE', label: 'Desconectada' },
]

const onuStatusOptions = [
  { value: 'ACTIVE', label: 'Activa' },
  { value: 'INACTIVE', label: 'Inactiva' },
  { value: 'LOS', label: 'Sin señal (LOS)' },
]

export function OltForm({
  action,
  olt,
  submitLabel,
}: {
  action: Action
  olt?: { name: string; host: string; port: number; vendor: string | null; status: OLTStatus }
  submitLabel: string
}) {
  return (
    <ActionForm action={action} resetOnSuccess={!olt}>
      <FormGrid>
        <TextField name="name" label="Nombre" required defaultValue={olt?.name} maxLength={100} />
        <TextField name="vendor" label="Marca / modelo" defaultValue={olt?.vendor ?? ''} placeholder="Huawei MA5608T" />
        <TextField name="host" label="IP de gestión" required defaultValue={olt?.host} />
        <TextField name="port" label="Puerto SNMP" type="number" min={1} max={65535} defaultValue={olt?.port ?? 161} />
        <TextField
          name="community"
          label="Comunidad SNMP"
          type="password"
          required={!olt}
          autoComplete="off"
          hint={olt ? 'Déjala vacía para conservar la actual' : 'Se guarda cifrada'}
        />
        <SelectField name="status" label="Estado" options={oltStatusOptions} defaultValue={olt?.status ?? 'UNKNOWN'} />
      </FormGrid>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  )
}

export function OnuForm({ action, customers }: { action: Action; customers: Array<{ value: string; label: string }> }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TextField name="serial" label="Serial" required placeholder="HWTC1234ABCD" />
        <TextField name="name" label="Descripción" maxLength={100} />
        <SelectField name="status" label="Estado" options={onuStatusOptions} defaultValue="ACTIVE" />
        <TextField name="slot" label="Slot" required type="number" min={0} defaultValue={0} />
        <TextField name="port" label="Puerto PON" required type="number" min={0} defaultValue={0} />
        <TextField name="onuIndex" label="ID de ONU" type="number" min={0} />
      </div>
      <SelectField name="customerId" label="Cliente" options={customers} placeholder="Sin asignar" />
      <SubmitButton>Registrar ONU</SubmitButton>
    </ActionForm>
  )
}
