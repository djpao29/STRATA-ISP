'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { FormGrid, SelectField, TextAreaField, TextField } from '@/components/forms/fields'
import { Button } from '@/components/ui/button'
import type { ActionState } from '@/lib/actions'
import { currencyLocale } from '@/lib/format'

type Line = { key: number; description: string; quantity: string; unitPrice: string }

export function ProformaForm({
  action,
  customers,
  plans,
  currency,
  defaultValidUntil,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  customers: Array<{ value: string; label: string }>
  plans: Array<{ name: string; price: string }>
  currency: string
  defaultValidUntil: string
}) {
  const [mode, setMode] = useState<'customer' | 'prospect'>('customer')
  const [lines, setLines] = useState<Line[]>([{ key: 0, description: '', quantity: '1', unitPrice: '' }])
  const fmt = (n: number) => new Intl.NumberFormat(currencyLocale(currency), { style: 'currency', currency }).format(n)
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0)

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const add = (preset?: Partial<Line>) =>
    setLines((ls) => [...ls, { key: Math.max(-1, ...ls.map((l) => l.key)) + 1, description: '', quantity: '1', unitPrice: '', ...preset }])

  return (
    <ActionForm action={action}>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === 'customer'} onChange={() => setMode('customer')} /> Cliente registrado
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === 'prospect'} onChange={() => setMode('prospect')} /> Prospecto (aún no es cliente)
        </label>
      </div>
      <FormGrid>
        {mode === 'customer' ? (
          <SelectField name="customerId" label="Cliente" required options={customers} placeholder="Elegir cliente…" />
        ) : (
          <>
            <TextField name="clientName" label="Nombre del prospecto" required maxLength={150} />
            <TextField name="clientInfo" label="Teléfono / dirección" maxLength={300} />
          </>
        )}
        <TextField name="validUntil" label="Válida hasta" required type="date" defaultValue={defaultValidUntil} />
      </FormGrid>

      <div className="space-y-2">
        <div className="text-sm font-medium">Conceptos</div>
        {lines.map((l, i) => (
          <div key={l.key} className="grid grid-cols-12 items-end gap-2">
            <label className="col-span-12 text-xs sm:col-span-6">
              <span className="text-muted-foreground">Descripción</span>
              <input
                name={`items[${i}][description]`}
                value={l.description}
                onChange={(e) => update(l.key, { description: e.target.value })}
                maxLength={300}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                placeholder="Instalación, router, cable, mensualidad…"
              />
            </label>
            <label className="col-span-3 text-xs sm:col-span-2">
              <span className="text-muted-foreground">Cant.</span>
              <input
                name={`items[${i}][quantity]`}
                type="number"
                min={0.01}
                step="0.01"
                value={l.quantity}
                onChange={(e) => update(l.key, { quantity: e.target.value })}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="col-span-5 text-xs sm:col-span-2">
              <span className="text-muted-foreground">Precio unit.</span>
              <input
                name={`items[${i}][unitPrice]`}
                type="number"
                min={0}
                step="0.01"
                value={l.unitPrice}
                onChange={(e) => update(l.key, { unitPrice: e.target.value })}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <div className="col-span-3 flex h-10 items-center justify-end gap-1 text-sm sm:col-span-2">
              <span className="font-medium">{fmt((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))}</span>
              {lines.length > 1 && (
                <button type="button" aria-label="Quitar línea" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => add()}>
            <Plus className="mr-1 h-4 w-4" /> Línea
          </Button>
          {plans.map((p) => (
            <Button key={p.name} type="button" variant="ghost" size="sm" onClick={() => add({ description: `Plan ${p.name} (mensualidad)`, unitPrice: p.price })}>
              + {p.name}
            </Button>
          ))}
        </div>
        <div className="text-right text-lg font-bold">Total: {fmt(total)}</div>
      </div>
      <TextAreaField name="notes" label="Notas / condiciones" maxLength={1000} rows={2} />
      <SubmitButton>Crear proforma</SubmitButton>
    </ActionForm>
  )
}

export function ConvertForm({
  action,
  customers,
  needsCustomer,
  defaultDueDate,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  customers: Array<{ value: string; label: string }>
  needsCustomer: boolean
  defaultDueDate: string
}) {
  return (
    <ActionForm action={action}>
      {needsCustomer && (
        <SelectField
          name="customerId"
          label="Cliente que recibe la factura"
          required
          options={customers}
          placeholder="Elegir cliente… (regístralo primero si es nuevo)"
        />
      )}
      <TextField name="dueDate" label="Vence el" required type="date" defaultValue={defaultDueDate} />
      <SubmitButton>Convertir en factura</SubmitButton>
    </ActionForm>
  )
}
