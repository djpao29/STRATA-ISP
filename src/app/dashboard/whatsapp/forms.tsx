'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { CheckboxField, FormGrid, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>

export function WhatsAppConfigForm({
  action,
  config,
}: {
  action: Action
  config: { phoneNumberId: string; displayPhone: string | null; isActive: boolean } | null
}) {
  return (
    <ActionForm action={action}>
      <FormGrid>
        <TextField
          name="phoneNumberId"
          label="Phone number ID"
          required
          defaultValue={config?.phoneNumberId}
          hint="Meta for Developers → WhatsApp → Configuración de la API"
        />
        <TextField name="displayPhone" label="Número visible" defaultValue={config?.displayPhone ?? ''} placeholder="+593 99 000 0000" />
      </FormGrid>
      <TextField
        name="accessToken"
        label="Token de acceso"
        type="password"
        required={!config}
        autoComplete="off"
        hint={config ? 'Déjalo vacío para conservar el actual. Usa un token permanente de usuario del sistema.' : 'Token permanente de usuario del sistema; se guarda cifrado'}
      />
      <CheckboxField name="isActive" label="Integración activa" defaultChecked={config?.isActive ?? false} />
      <SubmitButton>Guardar configuración</SubmitButton>
    </ActionForm>
  )
}

export function TestMessageForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action}>
      <FormGrid>
        <TextField name="to" label="Enviar a" required placeholder="0991234567 o +593991234567" />
        <TextField name="template" label="Plantilla" defaultValue="hello_world" />
        <TextField name="language" label="Idioma de la plantilla" defaultValue="en_US" />
      </FormGrid>
      <SubmitButton variant="outline">Enviar mensaje de prueba</SubmitButton>
    </ActionForm>
  )
}
