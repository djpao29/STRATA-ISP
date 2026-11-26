'use client'

import { useMemo, useState } from 'react'
import type { Zone } from '@prisma/client'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { CheckboxField, FormGrid, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'
import { cycleInfo, dateOn } from '@/lib/zones/cycle'

const fmt = (d: Date) => new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)

export function ZoneForm({
  action,
  zone,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  zone?: Zone
  submitLabel: string
}) {
  const [days, setDays] = useState({
    invoiceDay: zone?.invoiceDay ?? 15,
    dueDay: zone?.dueDay ?? 15,
    suspendDay: zone?.suspendDay ?? 20,
  })

  // Vista previa del ciclo con las fechas reales (incluye cambio de mes y febrero).
  const preview = useMemo(() => {
    const valid = Object.values(days).every((v) => Number.isInteger(v) && v >= 1 && v <= 31)
    if (!valid) return null
    const rules = { ...days, invoiceHour: 0, suspendHour: 0 }
    return [dateOn(2026, 10, days.invoiceDay), dateOn(2027, 1, days.invoiceDay)].map((c) => cycleInfo(rules, c))
  }, [days])

  const onDay = (key: keyof typeof days) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDays((d) => ({ ...d, [key]: Number(e.target.value) }))

  return (
    <ActionForm action={action}>
      <TextField name="name" label="Nombre" required defaultValue={zone?.name} placeholder="Ej: Zona 15" maxLength={60} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TextField name="invoiceDay" label="Día de factura" type="number" min={1} max={31} required defaultValue={days.invoiceDay} onChange={onDay('invoiceDay')} hint="Se genera la factura del mes" />
        <TextField name="dueDay" label="Día límite de pago" type="number" min={1} max={31} required defaultValue={days.dueDay} onChange={onDay('dueDay')} hint="Si es menor, cae el mes siguiente" />
        <TextField name="suspendDay" label="Día de corte" type="number" min={1} max={31} required defaultValue={days.suspendDay} onChange={onDay('suspendDay')} hint="Si es menor, cae el mes siguiente" />
      </div>
      {preview && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <p className="font-medium">Así quedan las fechas:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {preview.map((p) => (
              <li key={p.cycleDate.toISOString()}>
                Factura {fmt(p.cycleDate)} → paga hasta {fmt(p.dueDate)} → corte {fmt(p.suspendDate)} ({p.graceDays} días de gracia)
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">En meses sin ese día (p. ej. 30 en febrero) se usa el último día del mes.</p>
        </div>
      )}
      <FormGrid>
        <TextField name="invoiceHour" label="Hora de facturación (0-23)" type="number" min={0} max={23} required defaultValue={zone?.invoiceHour ?? 0} hint="Hora local de la empresa" />
        <TextField name="suspendHour" label="Hora de corte (0-23)" type="number" min={0} max={23} required defaultValue={zone?.suspendHour ?? 0} />
        <TextField
          name="suspendAfterInvoices"
          label="Cortar tras N facturas vencidas"
          type="number"
          min={1}
          max={12}
          required
          defaultValue={zone?.suspendAfterInvoices ?? 1}
          hint="Facturas impagas con la fecha de corte cumplida"
        />
      </FormGrid>
      <div className="grid grid-cols-1 gap-2 rounded-md border bg-gray-50 p-3 sm:grid-cols-2">
        <CheckboxField name="isActive" label="Zona activa" defaultChecked={zone?.isActive ?? true} />
        <CheckboxField name="autoInvoice" label="Generar facturas automáticamente" defaultChecked={zone?.autoInvoice ?? true} />
        <CheckboxField name="autoSuspend" label="Cortar automáticamente por falta de pago" defaultChecked={zone?.autoSuspend ?? true} />
        <CheckboxField name="autoReconnect" label="Reconectar automáticamente al pagar" defaultChecked={zone?.autoReconnect ?? true} />
        <CheckboxField name="invoiceSuspended" label="Facturar también a clientes suspendidos" defaultChecked={zone?.invoiceSuspended ?? false} />
      </div>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  )
}
