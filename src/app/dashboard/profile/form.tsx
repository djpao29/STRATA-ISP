'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'

export function ChangePasswordForm({ action }: { action: (state: ActionState, formData: FormData) => Promise<ActionState> }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <TextField name="current" label="Contraseña actual" type="password" required autoComplete="current-password" />
      <TextField
        name="password"
        label="Nueva contraseña"
        type="password"
        required
        autoComplete="new-password"
        hint="Mínimo 10 caracteres, con letras y números"
      />
      <TextField name="confirm" label="Repite la nueva contraseña" type="password" required autoComplete="new-password" />
      <SubmitButton>Cambiar contraseña</SubmitButton>
    </ActionForm>
  )
}
