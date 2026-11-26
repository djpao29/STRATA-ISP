'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { FormGrid, SelectField, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'
import { paymentMethodOptions } from '@/lib/labels'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>

export function GenerateInvoicesForm({ action, defaultPeriod }: { action: Action; defaultPeriod: string }) {
  return (
    <ActionForm action={action} className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-end">
      <TextField name="period" label="Mes a facturar" type="month" required defaultValue={defaultPeriod} className="sm:w-56" />
      <SubmitButton>Generar facturas del mes</SubmitButton>
    </ActionForm>
  )
}

export function InvoiceForm({
  action,
  customers,
  defaultCustomerId,
  defaultDueDate,
}: {
  action: Action
  customers: Array<{ value: string; label: string }>
  defaultCustomerId?: string
  defaultDueDate: string
}) {
  return (
    <ActionForm action={action}>
      <SelectField
        name="customerId"
        label="Cliente"
        required
        options={customers}
        placeholder="Elegir cliente…"
        defaultValue={defaultCustomerId ?? ''}
      />
      <TextField name="description" label="Concepto" required maxLength={300} placeholder="Instalación, equipo, servicio adicional…" />
      <FormGrid>
        <TextField name="amount" label="Monto" required type="number" min={0.01} step="0.01" />
        <TextField name="dueDate" label="Vence el" required type="date" defaultValue={defaultDueDate} />
      </FormGrid>
      <SubmitButton>Crear factura</SubmitButton>
    </ActionForm>
  )
}

export function PaymentForm({
  action,
  remaining,
  today,
}: {
  action: Action
  remaining: string
  today: string
}) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <FormGrid>
        <TextField name="amount" label="Monto" required type="number" min={0.01} step="0.01" defaultValue={remaining} />
        <SelectField name="method" label="Método" options={paymentMethodOptions} defaultValue="CASH" />
        <TextField name="paidDate" label="Fecha de pago" required type="date" defaultValue={today} />
        <TextField name="reference" label="Referencia / comprobante" maxLength={100} />
      </FormGrid>
      <TextField name="notes" label="Notas" maxLength={500} />
      <SubmitButton>Registrar pago</SubmitButton>
    </ActionForm>
  )
}
