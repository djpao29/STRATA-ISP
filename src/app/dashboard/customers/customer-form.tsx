'use client'

import type { Customer } from '@prisma/client'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { FormGrid, SelectField, TextAreaField, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'
import { customerStatusOptions } from '@/lib/labels'

export function CustomerForm({
  action,
  customer,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  customer?: Customer
  submitLabel: string
}) {
  return (
    <ActionForm action={action}>
      <FormGrid>
        <TextField name="firstName" label="Nombres" required defaultValue={customer?.firstName} maxLength={100} />
        <TextField name="lastName" label="Apellidos" required defaultValue={customer?.lastName} maxLength={100} />
        <TextField name="cedula" label="Cédula / RUC" required defaultValue={customer?.cedula} maxLength={20} />
        <TextField name="phone" label="Teléfono" required defaultValue={customer?.phone} placeholder="0991234567" />
        <TextField name="email" label="Correo" type="email" defaultValue={customer?.email ?? ''} />
        <SelectField
          name="status"
          label="Estado"
          options={customerStatusOptions}
          defaultValue={customer?.status ?? 'PENDING'}
        />
        <TextField name="address" label="Dirección" defaultValue={customer?.address ?? ''} className="md:col-span-2" />
        <TextField name="city" label="Ciudad" defaultValue={customer?.city ?? ''} />
        <TextField name="neighborhood" label="Barrio / sector" defaultValue={customer?.neighborhood ?? ''} />
        <TextField
          name="coordinates"
          label="Coordenadas"
          defaultValue={customer?.coordinates ?? ''}
          placeholder="-2.1700,-79.9200"
          hint="Latitud,longitud de la instalación"
        />
      </FormGrid>
      <TextAreaField name="notes" label="Notas internas" defaultValue={customer?.notes ?? ''} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  )
}
