'use client'

import { useState } from 'react'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { FormGrid, SelectField, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'
import { ReceiptField } from '../billing/forms'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>
type Option = { value: string; label: string }

export function PaymentReportForm({
  action,
  invoices,
  accounts,
  today,
}: {
  action: Action
  invoices: Array<Option & { balance: string }>
  accounts: Option[]
  today: string
}) {
  const [amount, setAmount] = useState('')
  return (
    <ActionForm action={action} resetOnSuccess>
      <SelectField
        name="invoiceId"
        label="Factura"
        required
        options={invoices}
        placeholder="Elegir factura pendiente…"
        onChange={(e) => setAmount(invoices.find((i) => i.value === e.target.value)?.balance ?? '')}
      />
      <FormGrid>
        <TextField name="amount" label="Monto reportado" required type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <SelectField name="accountId" label="Pagó en" required options={accounts} defaultValue={accounts[0]?.value} />
        <TextField name="paidDate" label="Fecha del pago" required type="date" defaultValue={today} />
        <TextField name="reference" label="Referencia / N.º de transacción" maxLength={100} />
      </FormGrid>
      <ReceiptField />
      <TextField name="notes" label="Notas" maxLength={500} placeholder="Ej: enviado por WhatsApp" />
      <SubmitButton>Registrar reporte</SubmitButton>
    </ActionForm>
  )
}

export function RejectForm({ action, id }: { action: Action; id: string }) {
  return (
    <ActionForm action={action} className="flex items-center gap-1 space-y-0">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value="REJECTED" />
      <input name="reason" placeholder="Motivo del rechazo" maxLength={300} className="h-9 w-40 rounded-md border border-input px-2 text-xs" />
      <SubmitButton size="sm" variant="ghost" className="text-red-600">
        Rechazar
      </SubmitButton>
    </ActionForm>
  )
}

export function PromiseForm({ action, customers, today }: { action: Action; customers: Option[]; today: string }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <SelectField name="customerId" label="Cliente (con deuda)" required options={customers} placeholder="Elegir cliente…" />
      <FormGrid>
        <TextField name="promisedDate" label="Pagará a más tardar el" required type="date" min={today} defaultValue={today} hint="Máximo 30 días" />
        <TextField name="amount" label="Monto prometido (opcional)" type="number" min={0.01} step="0.01" />
      </FormGrid>
      <TextField name="notes" label="Notas" maxLength={500} placeholder="Ej: cobra el viernes" />
      <SubmitButton>Registrar promesa</SubmitButton>
    </ActionForm>
  )
}
