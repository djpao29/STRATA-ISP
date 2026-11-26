'use client'

import { useState } from 'react'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { FormGrid, SelectField, TextAreaField, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>
type Option = { value: string; label: string }

export function ScheduleForm({ action, customers, technicians, defaultAt }: { action: Action; customers: Option[]; technicians: Option[]; defaultAt: string }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <FormGrid>
        <SelectField name="customerId" label="Cliente" required options={customers} placeholder="Elegir cliente…" />
        <TextField name="scheduledAt" label="Fecha y hora" required type="datetime-local" defaultValue={defaultAt} />
        <SelectField name="technicianId" label="Técnico" options={technicians} placeholder="Sin asignar" />
      </FormGrid>
      <TextAreaField name="notes" label="Indicaciones" rows={2} maxLength={1000} placeholder="Referencias de la dirección, materiales, contacto…" />
      <SubmitButton>Programar instalación</SubmitButton>
    </ActionForm>
  )
}

/** Acciones de una instalación abierta: reprogramar o completar. */
export function InstallationActions({
  update,
  complete,
  technicians,
  scheduledAt,
  technicianId,
  notes,
}: {
  update: Action
  complete: Action
  technicians: Option[]
  scheduledAt: string
  technicianId: string | null
  notes: string | null
}) {
  const [mode, setMode] = useState<'none' | 'edit' | 'done'>('none')
  if (mode === 'edit') {
    return (
      <ActionForm action={update} className="space-y-2 rounded-md border bg-gray-50 p-3">
        <TextField name="scheduledAt" label="Fecha y hora" required type="datetime-local" defaultValue={scheduledAt} />
        <SelectField name="technicianId" label="Técnico" options={technicians} placeholder="Sin asignar" defaultValue={technicianId ?? ''} />
        <TextField name="notes" label="Indicaciones" defaultValue={notes ?? ''} maxLength={1000} />
        <div className="flex gap-2">
          <SubmitButton size="sm">Guardar</SubmitButton>
          <button type="button" className="text-sm text-muted-foreground" onClick={() => setMode('none')}>Cancelar</button>
        </div>
      </ActionForm>
    )
  }
  if (mode === 'done') {
    return (
      <ActionForm action={complete} className="space-y-2 rounded-md border border-green-200 bg-green-50 p-3">
        <TextField name="completionNotes" label="Notas de cierre (equipo instalado, señal…)" maxLength={1000} />
        <div className="flex gap-2">
          <SubmitButton size="sm">Marcar como completada</SubmitButton>
          <button type="button" className="text-sm text-muted-foreground" onClick={() => setMode('none')}>Cancelar</button>
        </div>
      </ActionForm>
    )
  }
  return (
    <div className="flex flex-wrap gap-1">
      <button type="button" className="inline-flex h-9 items-center rounded-md bg-green-600 px-3 text-sm font-medium text-white hover:bg-green-700" onClick={() => setMode('done')}>
        Completar
      </button>
      <button type="button" className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent" onClick={() => setMode('edit')}>
        Reprogramar
      </button>
    </div>
  )
}
