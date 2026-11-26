'use client'

import type { PaymentMethod } from '@prisma/client'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { SelectField, TextAreaField, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'
import { paymentMethodOptions } from '@/lib/labels'

export function AccountForm({
  action,
  account,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  account?: { name: string; method: PaymentMethod; details: string | null }
  submitLabel: string
}) {
  return (
    <ActionForm action={action} resetOnSuccess={!account}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField name="name" label="Nombre" required defaultValue={account?.name} placeholder="Ej: Banco Popular cta. 123-456" maxLength={80} />
        <SelectField name="method" label="Tipo" options={paymentMethodOptions} defaultValue={account?.method ?? 'TRANSFER'} />
      </div>
      <TextAreaField
        name="details"
        label="Datos para el cliente"
        defaultValue={account?.details ?? ''}
        rows={2}
        maxLength={500}
        placeholder="Banco, número de cuenta, titular, cédula/RNC…"
      />
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  )
}
