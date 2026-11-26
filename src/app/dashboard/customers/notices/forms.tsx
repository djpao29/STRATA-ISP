'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { CheckboxField, FormGrid, SelectField, TextAreaField, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>

export type NoticeValues = {
  title: string
  message: string
  severity: string
  roles: string[]
  startsAt: string
  endsAt: string
  dismissible: boolean
}

const SEVERITIES = [
  { value: 'INFO', label: 'Información (azul)' },
  { value: 'WARNING', label: 'Advertencia (ámbar)' },
  { value: 'CRITICAL', label: 'Crítico (rojo)' },
]

export function NoticeForm({ action, roles, values, submitLabel }: { action: Action; roles: Array<{ value: string; label: string }>; values?: NoticeValues; submitLabel: string }) {
  return (
    <ActionForm action={action} resetOnSuccess={!values}>
      <FormGrid>
        <TextField name="title" label="Título" required maxLength={120} defaultValue={values?.title} placeholder="Mantenimiento en la torre norte" />
        <SelectField name="severity" label="Importancia" options={SEVERITIES} defaultValue={values?.severity ?? 'INFO'} />
        <TextField name="startsAt" label="Mostrar desde" type="datetime-local" defaultValue={values?.startsAt} hint="Vacío = ahora" />
        <TextField name="endsAt" label="Mostrar hasta" type="datetime-local" defaultValue={values?.endsAt} hint="Vacío = hasta desactivarlo" />
      </FormGrid>
      <TextAreaField name="message" label="Mensaje" required rows={3} maxLength={2000} defaultValue={values?.message} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Quién lo ve</legend>
        <div className="flex flex-wrap gap-4">
          {roles.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="roles" value={r.value} defaultChecked={values?.roles.includes(r.value)} className="h-4 w-4 rounded border-input" />
              {r.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Sin marcar ninguno, lo ve todo el personal.</p>
      </fieldset>
      <CheckboxField name="dismissible" label="Cada usuario puede ocultarlo" defaultChecked={values?.dismissible ?? true} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  )
}
