'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import type { ActionState } from '@/lib/actions'

export function ZoneSelectForm({
  action,
  zones,
  current,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  zones: Array<{ value: string; label: string }>
  current: string | null
}) {
  return (
    <ActionForm action={action} className="flex items-end gap-2 space-y-0">
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted-foreground">Cambiar zona</span>
        <select name="zoneId" defaultValue={current ?? ''} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="" disabled>
            Elegir zona…
          </option>
          {zones.map((z) => (
            <option key={z.value} value={z.value}>
              {z.label}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton size="sm" variant="outline">
        Cambiar
      </SubmitButton>
    </ActionForm>
  )
}
