'use client'

import type { Priority, TicketStatus } from '@prisma/client'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { FormGrid, SelectField, TextAreaField, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'
import { priorityOptions, ticketStatusOptions } from '@/lib/labels'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>
type Option = { value: string; label: string }

export function TicketForm({
  action,
  customers,
  users,
  defaultCustomerId,
}: {
  action: Action
  customers: Option[]
  users: Option[]
  defaultCustomerId?: string
}) {
  return (
    <ActionForm action={action}>
      <SelectField name="customerId" label="Cliente" required options={customers} placeholder="Elegir cliente…" defaultValue={defaultCustomerId ?? ''} />
      <TextField name="title" label="Asunto" required maxLength={200} />
      <TextAreaField name="description" label="Descripción" required rows={5} maxLength={5000} />
      <FormGrid>
        <SelectField name="priority" label="Prioridad" options={priorityOptions} defaultValue="MEDIUM" />
        <SelectField name="assignedTo" label="Asignar a" options={users} placeholder="Sin asignar" />
      </FormGrid>
      <SubmitButton>Crear ticket</SubmitButton>
    </ActionForm>
  )
}

export function TicketUpdateForm({
  action,
  users,
  status,
  priority,
  assignedTo,
}: {
  action: Action
  users: Option[]
  status: TicketStatus
  priority: Priority
  assignedTo: string | null
}) {
  return (
    <ActionForm action={action}>
      <SelectField name="status" label="Estado" options={ticketStatusOptions} defaultValue={status} />
      <SelectField name="priority" label="Prioridad" options={priorityOptions} defaultValue={priority} />
      <SelectField name="assignedTo" label="Asignado a" options={users} placeholder="Sin asignar" defaultValue={assignedTo ?? ''} />
      <SubmitButton className="w-full">Guardar</SubmitButton>
    </ActionForm>
  )
}

export function CommentForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <TextAreaField name="message" label="Nuevo comentario" required rows={3} maxLength={5000} />
      <SubmitButton>Comentar</SubmitButton>
    </ActionForm>
  )
}
