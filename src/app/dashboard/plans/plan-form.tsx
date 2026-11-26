'use client'

import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import type { PlanKind } from '@prisma/client'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { TextField } from '@/components/forms/fields'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import type { ActionState } from '@/lib/actions'
import { cn } from '@/lib/utils'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>

export type PlanValues = {
  name: string
  download: number
  upload: number
  price: string
  category: 'RESIDENTIAL' | 'CORPORATE'
  burst: string | null
  priorityUp: number
  priorityDown: number
  pppProfile: string | null
}

function CategoryRadio({ value }: { value?: 'RESIDENTIAL' | 'CORPORATE' }) {
  const [cat, setCat] = useState(value ?? 'RESIDENTIAL')
  const opt = (v: 'RESIDENTIAL' | 'CORPORATE', label: string) => (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium',
        cat === v ? 'border-teal-500 bg-teal-50 text-teal-800' : 'hover:bg-gray-50'
      )}
    >
      <input type="radio" name="category" value={v} checked={cat === v} onChange={() => setCat(v)} className="accent-teal-600" />
      {label}
    </label>
  )
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-semibold uppercase tracking-wide text-gray-600">Tipo</legend>
      <div className="flex gap-2">
        {opt('RESIDENTIAL', 'Residencial')}
        {opt('CORPORATE', 'Corporativo')}
      </div>
    </fieldset>
  )
}

/** Formulario de plan para la ventana "Nuevo Perfil" / "Nuevo Perfil PPPoE". */
function PlanFields({ kind, values, currency }: { kind: PlanKind; values?: PlanValues; currency: string }) {
  return (
    <>
      <TextField name="name" label="Nombre Plan" required maxLength={100} placeholder="Ej: PLAN GENERAL 35" defaultValue={values?.name} />
      <div className="grid grid-cols-2 gap-3">
        <TextField name="download" label="Descarga (Mbps)" required type="number" min={1} placeholder="35" defaultValue={values?.download || undefined} />
        <TextField name="upload" label="Subida (Mbps)" required type="number" min={1} placeholder="35" defaultValue={values?.upload || undefined} />
      </div>
      <TextField
        name="price"
        label={`Precio Plan (${currency})`}
        required
        type="number"
        min={0.01}
        step="0.01"
        placeholder="35.00"
        defaultValue={values && Number(values.price) > 0 ? values.price : undefined}
      />
      <CategoryRadio value={values?.category} />
      {kind === 'SIMPLE_QUEUE' ? (
        <>
          <TextField name="burst" label="Burst (opcional)" placeholder="20M/5M 15M/4M 10" defaultValue={values?.burst ?? ''} hint="Como en MikroTik (subida/bajada): límite umbral tiempo" />
          <div className="grid grid-cols-2 gap-3">
            <TextField name="priorityUp" label="Prio upload" type="number" min={1} max={8} defaultValue={values?.priorityUp ?? 8} />
            <TextField name="priorityDown" label="Prio download" type="number" min={1} max={8} defaultValue={values?.priorityDown ?? 8} />
          </div>
        </>
      ) : (
        <TextField name="pppProfile" label="Perfil PPP" placeholder="default / 10M" defaultValue={values?.pppProfile ?? ''} hint="Nombre del perfil en /ppp/profile. Vacío = el nombre del plan" />
      )}
    </>
  )
}

/** Botón "Nuevo" o lápiz de editar, con su ventana. */
export function PlanDialog({ action, kind, values, currency }: { action: Action; kind: PlanKind; values?: PlanValues; currency: string }) {
  const [open, setOpen] = useState(false)
  const title = values ? (kind === 'PPPOE' ? 'Editar Perfil PPPoE' : 'Editar Perfil') : kind === 'PPPOE' ? 'Nuevo Perfil PPPoE' : 'Nuevo Perfil'
  return (
    <>
      {values ? (
        <button type="button" title="Editar" onClick={() => setOpen(true)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white text-gray-600 hover:bg-gray-50">
          <Pencil className="h-4 w-4" />
        </button>
      ) : (
        <Button type="button" size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Nuevo
        </Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <ActionForm action={action} onSuccess={() => setOpen(false)}>
          <PlanFields kind={kind} values={values} currency={currency} />
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
            <SubmitButton className="bg-green-600 hover:bg-green-700">
              {values ? (
                'Guardar'
              ) : (
                <>
                  <Plus className="mr-1 h-4 w-4" />
                  Registrar
                </>
              )}
            </SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </>
  )
}

/** Selector "15 / 25 / 50 / 100" que cambia la URL. */
export function PageSizeSelect({ value, hrefFor }: { value: number; hrefFor: Record<number, string> }) {
  return (
    <select
      value={value}
      onChange={(e) => (window.location.href = hrefFor[Number(e.target.value)])}
      className="h-10 w-36 rounded-md border border-input bg-background px-3 text-sm"
      aria-label="Planes por página"
    >
      {[15, 25, 50, 100].map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  )
}
