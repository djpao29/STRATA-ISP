'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'

export function PlanForm({
  action,
  plan,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  plan?: { name: string; description: string | null; download: number; upload: number; price: string }
  submitLabel: string
}) {
  return (
    <ActionForm action={action} resetOnSuccess={!plan}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <TextField name="name" label="Nombre" required defaultValue={plan?.name} className="md:col-span-2" maxLength={100} />
        <TextField name="download" label="Bajada (Mbps)" required type="number" min={1} defaultValue={plan?.download} />
        <TextField name="upload" label="Subida (Mbps)" required type="number" min={1} defaultValue={plan?.upload} />
        <TextField name="price" label="Precio mensual" required type="number" min={0.01} step="0.01" defaultValue={plan?.price} />
      </div>
      <TextField name="description" label="Descripción" defaultValue={plan?.description ?? ''} maxLength={500} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  )
}
