'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { FormGrid, SelectField, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>

export function GenerateInvoicesForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} className="space-y-0">
      <SubmitButton variant="outline">Facturar ciclo vigente ahora</SubmitButton>
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
  accounts,
  submitLabel = 'Registrar pago',
}: {
  action: Action
  remaining: string
  today: string
  accounts: Array<{ value: string; label: string }>
  submitLabel?: string
}) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <FormGrid>
        <TextField name="amount" label="Monto" required type="number" min={0.01} step="0.01" defaultValue={remaining} />
        <SelectField name="accountId" label="Forma de pago" required options={accounts} defaultValue={accounts[0]?.value} />
        <TextField name="paidDate" label="Fecha de pago" required type="date" defaultValue={today} />
        <TextField name="reference" label="Referencia / N.º de transacción" maxLength={100} />
      </FormGrid>
      <ReceiptField />
      <TextField name="notes" label="Notas" maxLength={500} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  )
}

/** Campo para adjuntar la foto o el PDF del comprobante. */
export function ReceiptField({ required = false }: { required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="receipt" className="text-sm font-medium">
        Comprobante (foto o PDF, máx. 5 MB){required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input
        id="receipt"
        name="receipt"
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm hover:file:bg-accent"
      />
    </div>
  )
}
