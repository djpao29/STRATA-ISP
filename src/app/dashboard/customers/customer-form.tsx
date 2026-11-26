'use client'

import type { Customer } from '@prisma/client'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { CheckboxField, SelectField, TextAreaField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'
import { CustomerInfoFields } from './customer-fields'

/** Editar los datos de un cliente (el servicio se gestiona en su ficha). */
export function CustomerForm({
  action,
  customer,
  zones,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  customer?: Customer
  zones: Array<{ value: string; label: string }>
  submitLabel: string
}) {
  return (
    <ActionForm action={action}>
      <CustomerInfoFields customer={customer} />
      <SelectField
        name="zoneId"
        label="Zona de facturación"
        required
        options={zones}
        placeholder="Elegir zona…"
        defaultValue={customer?.zoneId ?? ''}
        hint="Define el día de factura, el límite de pago y el día de corte"
      />
      <TextAreaField name="notes" label="Notas internas" defaultValue={customer?.notes ?? ''} />
      <CheckboxField name="suspendExempt" label="Exento de corte automático (nunca cortar a este cliente por falta de pago)" defaultChecked={customer?.suspendExempt ?? false} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  )
}
