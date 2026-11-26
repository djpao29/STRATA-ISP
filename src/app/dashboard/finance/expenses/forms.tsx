'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { FormGrid, SelectField, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'
import { ReceiptField } from '../../billing/forms'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>
type Option = { value: string; label: string }

export function ExpenseForm({ action, categories, accounts, today }: { action: Action; categories: Option[]; accounts: Option[]; today: string }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <FormGrid>
        <TextField name="date" label="Fecha" required type="date" defaultValue={today} />
        <SelectField name="categoryId" label="Categoría" required options={categories} placeholder="Elegir categoría…" />
        <TextField name="description" label="Descripción" required maxLength={300} className="md:col-span-2" placeholder="Ej: Pago de ancho de banda noviembre" />
        <TextField name="amount" label="Monto" required type="number" min={0.01} step="0.01" />
        <SelectField name="accountId" label="Pagado desde" options={accounts} placeholder="Sin especificar" />
        <TextField name="supplier" label="Proveedor" maxLength={150} />
        <TextField name="reference" label="N.º de factura / referencia" maxLength={100} />
      </FormGrid>
      <ReceiptField />
      <SubmitButton>Registrar gasto</SubmitButton>
    </ActionForm>
  )
}

export function CategoryForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} resetOnSuccess className="flex items-end gap-2 space-y-0">
      <TextField name="name" label="Nueva categoría" required maxLength={60} className="flex-1" />
      <SubmitButton>Agregar</SubmitButton>
    </ActionForm>
  )
}
