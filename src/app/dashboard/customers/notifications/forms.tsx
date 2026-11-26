'use client'

import { useRef, useState, useTransition } from 'react'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { FormGrid, SelectField, TextField } from '@/components/forms/fields'
import { Button } from '@/components/ui/button'
import type { ActionState } from '@/lib/actions'
import { previewAudience } from './actions'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>
type Option = { value: string; label: string }

const AUDIENCES: Option[] = [
  { value: 'debtors', label: 'Clientes con deuda' },
  { value: 'suspended', label: 'Clientes cortados' },
  { value: 'active', label: 'Clientes activos' },
  { value: 'all', label: 'Todos (menos cancelados)' },
  { value: 'zone', label: 'Una zona' },
  { value: 'customer', label: 'Un cliente' },
]

type Preview = Awaited<ReturnType<typeof previewAudience>>

export function CampaignForm({ action, zones, customers, variables }: { action: Action; zones: Option[]; customers: Option[]; variables: Option[] }) {
  const [audience, setAudience] = useState('debtors')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [pending, start] = useTransition()
  const paramsRef = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLDivElement>(null)

  const insert = (v: string) => {
    const el = paramsRef.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b, value } = el
    el.value = value.slice(0, a) + v + value.slice(b)
    el.focus()
    el.selectionStart = el.selectionEnd = a + v.length
  }

  const runPreview = () => {
    const root = formRef.current
    if (!root) return
    const get = (n: string) => (root.querySelector(`[name="${n}"]`) as HTMLInputElement | HTMLSelectElement | null)?.value ?? ''
    start(async () => setPreview(await previewAudience({ audience: get('audience'), zoneId: get('zoneId'), customerId: get('customerId'), params: paramsRef.current?.value ?? '' })))
  }

  return (
    <div ref={formRef}>
      <ActionForm action={action} resetOnSuccess>
        <FormGrid>
          <TextField name="name" label="Nombre de la campaña" required maxLength={120} placeholder="Recordatorio de pago noviembre" />
          <SelectField
            name="audience"
            label="Enviar a"
            required
            options={AUDIENCES}
            value={audience}
            onChange={(e) => {
              setAudience(e.target.value)
              setPreview(null)
            }}
          />
          {audience === 'zone' && <SelectField name="zoneId" label="Zona" required options={zones} placeholder="Elegir zona…" onChange={() => setPreview(null)} />}
          {audience === 'customer' && <SelectField name="customerId" label="Cliente" required options={customers} placeholder="Elegir cliente…" onChange={() => setPreview(null)} />}
          <TextField name="template" label="Plantilla aprobada en Meta" required placeholder="recordatorio_pago" hint="El nombre exacto de la plantilla en WhatsApp Manager" />
          <TextField name="language" label="Idioma de la plantilla" defaultValue="es" hint="es, es_MX, en_US… (el mismo de la plantilla)" />
        </FormGrid>

        <div className="space-y-1.5">
          <label htmlFor="params" className="text-sm font-medium">
            Parámetros de la plantilla
          </label>
          <textarea
            id="params"
            name="params"
            ref={paramsRef}
            rows={4}
            maxLength={4000}
            placeholder={'Uno por línea, en el orden {{1}}, {{2}}… de la plantilla.\nEj:\n{nombre}\n{saldo}\n{fecha_corte}'}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
          />
          <div className="flex flex-wrap gap-1">
            {variables.map((v) => (
              <button key={v.value} type="button" title={v.label} onClick={() => insert(v.value)} className="rounded border bg-gray-50 px-2 py-0.5 font-mono text-xs hover:bg-gray-100">
                {v.value}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Toca una variable para insertarla. Cada cliente recibe sus propios datos.</p>
        </div>

        {preview && (
          <div className="rounded-md border bg-gray-50 p-3 text-sm">
            {'error' in preview && preview.error ? (
              <p className="text-red-700">{preview.error}</p>
            ) : 'total' in preview ? (
              <>
                <p>
                  <strong>{preview.withPhone}</strong> de {preview.total} clientes tienen teléfono y recibirán el mensaje.
                </p>
                {preview.sample && (
                  <div className="mt-2">
                    <p className="text-muted-foreground">
                      Ejemplo: {preview.sample.name} ({preview.sample.phone})
                    </p>
                    <ol className="ml-5 list-decimal">
                      {preview.sample.params.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={runPreview} disabled={pending}>
            {pending ? 'Calculando…' : 'Vista previa'}
          </Button>
          <SubmitButton>Enviar por WhatsApp</SubmitButton>
        </div>
      </ActionForm>
    </div>
  )
}
