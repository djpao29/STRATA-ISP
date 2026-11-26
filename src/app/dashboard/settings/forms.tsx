'use client'

import type { Tenant } from '@prisma/client'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { FormGrid, SelectField, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'
import { ROLE_LABELS } from '@/lib/permissions'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>

const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))

export function CompanyForm({
  action,
  tenant,
}: {
  action: Action
  tenant: Pick<Tenant, 'name' | 'taxId' | 'address' | 'phone' | 'email' | 'currency' | 'timezone' | 'invoicePrefix' | 'dueDays' | 'nextInvoiceNumber'>
}) {
  return (
    <ActionForm action={action}>
      <FormGrid>
        <TextField name="name" label="Nombre comercial" required defaultValue={tenant.name} />
        <TextField name="taxId" label="RUC" defaultValue={tenant.taxId ?? ''} />
        <TextField name="phone" label="Teléfono" defaultValue={tenant.phone ?? ''} />
        <TextField name="email" label="Correo" type="email" defaultValue={tenant.email ?? ''} />
        <TextField name="address" label="Dirección" defaultValue={tenant.address ?? ''} className="md:col-span-2" />
        <TextField name="currency" label="Moneda" required defaultValue={tenant.currency} maxLength={3} />
        <TextField name="timezone" label="Zona horaria" required defaultValue={tenant.timezone} />
        <TextField
          name="invoicePrefix"
          label="Prefijo de facturas"
          required
          defaultValue={tenant.invoicePrefix}
          hint={`Próximo número: ${tenant.invoicePrefix}-${String(tenant.nextInvoiceNumber).padStart(6, '0')}`}
        />
        <TextField name="dueDays" label="Días para pagar" required type="number" min={0} max={90} defaultValue={tenant.dueDays} />
      </FormGrid>
      <SubmitButton>Guardar</SubmitButton>
    </ActionForm>
  )
}

export function NewUserForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <FormGrid>
        <TextField name="name" label="Nombre" required />
        <TextField name="email" label="Correo" type="email" required autoComplete="off" />
        <SelectField name="role" label="Rol" options={roleOptions} defaultValue="TECHNICIAN" />
        <TextField
          name="password"
          label="Contraseña inicial"
          type="password"
          required
          autoComplete="new-password"
          hint="Mínimo 10 caracteres, con letras y números"
        />
      </FormGrid>
      <SubmitButton>Crear usuario</SubmitButton>
    </ActionForm>
  )
}

export function RoleSelectForm({ action, id, role }: { action: Action; id: string; role: string }) {
  return (
    <ActionForm action={action} className="flex items-center gap-2 space-y-0">
      <input type="hidden" name="id" value={id} />
      <select name="role" defaultValue={role} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
        {roleOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <SubmitButton size="sm" variant="outline">
        Cambiar
      </SubmitButton>
    </ActionForm>
  )
}

export function ResetPasswordForm({ action, id }: { action: Action; id: string }) {
  return (
    <ActionForm action={action} resetOnSuccess className="flex items-start gap-2 space-y-0">
      <input type="hidden" name="id" value={id} />
      <TextField name="password" label="" type="password" placeholder="Nueva contraseña" autoComplete="new-password" className="w-44" />
      <SubmitButton size="sm" variant="outline">
        Restablecer
      </SubmitButton>
    </ActionForm>
  )
}
