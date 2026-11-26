'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { CheckboxField, FormGrid, SelectField, TextAreaField, TextField } from '@/components/forms/fields'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import type { ActionState } from '@/lib/actions'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>
type Option = { value: string; label: string }

const BRANDS: Option[] = [
  { value: 'HUAWEI', label: 'Huawei (MA5608T / MA5683T / MA5800)' },
  { value: 'ZTE', label: 'ZTE (C300 / C320 / C600)' },
  { value: 'VSOL', label: 'VSOL (V1600 / V2800)' },
]

export type OltValues = {
  name: string
  brand: string
  vendor: string | null
  host: string
  port: number
  cliProtocol: string
  cliPort: number
  cliUsername: string | null
  hasCliPassword: boolean
  frame: number
  coordinates: string | null
  pollEnabled: boolean
  lineProfile: string | null
  srvProfile: string | null
  defaultVlan: number | null
  authTemplate: string | null
}

export function OltForm({ action, olt, templates, submitLabel }: { action: Action; olt?: OltValues; templates: Record<string, string>; submitLabel: string }) {
  const [brand, setBrand] = useState(olt?.brand ?? 'HUAWEI')
  const [proto, setProto] = useState(olt?.cliProtocol ?? 'TELNET')
  return (
    <ActionForm action={action}>
      <h3 className="text-sm font-semibold">Equipo</h3>
      <FormGrid>
        <TextField name="name" label="Nombre" required maxLength={100} defaultValue={olt?.name} placeholder="OLT Central" />
        <SelectField name="brand" label="Marca" required options={BRANDS} value={brand} onChange={(e) => setBrand(e.target.value)} />
        <TextField name="vendor" label="Modelo" maxLength={60} defaultValue={olt?.vendor ?? ''} placeholder="MA5608T" />
        <TextField name="host" label="IP de gestión" required defaultValue={olt?.host} placeholder="10.0.0.2" />
        <TextField name="frame" label="Frame / rack" type="number" min={0} max={15} defaultValue={olt?.frame ?? (brand === 'ZTE' ? 1 : 0)} hint="Huawei y VSOL: 0 · ZTE: 1" />
        <TextField name="coordinates" label="Ubicación (lat,lng)" defaultValue={olt?.coordinates ?? ''} placeholder="18.4861,-69.9312" hint="Para el Mapa FTTH" />
      </FormGrid>

      <h3 className="pt-2 text-sm font-semibold">Lectura (SNMP v2c, solo lectura)</h3>
      <FormGrid>
        <TextField name="port" label="Puerto SNMP" type="number" min={1} max={65535} defaultValue={olt?.port ?? 161} />
        <TextField
          name="community"
          label="Comunidad SNMP (lectura)"
          type="password"
          autoComplete="off"
          required={!olt && brand !== 'VSOL'}
          hint={olt ? 'Vacía = conservar la actual' : brand === 'VSOL' ? 'Opcional en VSOL (se lee por consola)' : 'Se guarda cifrada'}
        />
      </FormGrid>
      <CheckboxField name="pollEnabled" label="Leer esta OLT automáticamente" defaultChecked={olt?.pollEnabled ?? true} />

      <h3 className="pt-2 text-sm font-semibold">Consola (para autorizar ONUs{brand === 'ZTE' ? ' y leer las no configuradas' : brand === 'VSOL' ? ' y para leer' : ''})</h3>
      <FormGrid>
        <SelectField
          name="cliProtocol"
          label="Protocolo"
          options={[
            { value: 'TELNET', label: 'Telnet' },
            { value: 'SSH', label: 'SSH' },
          ]}
          value={proto}
          onChange={(e) => setProto(e.target.value)}
        />
        <TextField name="cliPort" label="Puerto" type="number" min={1} max={65535} defaultValue={olt?.cliPort ?? (proto === 'SSH' ? 22 : 23)} key={proto} />
        <TextField name="cliUsername" label="Usuario" maxLength={60} defaultValue={olt?.cliUsername ?? ''} autoComplete="off" />
        <TextField name="cliPassword" label="Clave" type="password" autoComplete="new-password" hint={olt?.hasCliPassword ? 'Vacía = conservar la actual' : 'Se guarda cifrada'} />
        <TextField name="enablePassword" label="Clave de enable (si la pide)" type="password" autoComplete="new-password" hint="Opcional" />
      </FormGrid>

      <h3 className="pt-2 text-sm font-semibold">Valores por defecto al autorizar</h3>
      <FormGrid>
        <TextField name="lineProfile" label={brand === 'HUAWEI' ? 'ont-lineprofile-id' : brand === 'ZTE' ? 'Perfil tcont' : 'Perfil'} maxLength={60} defaultValue={olt?.lineProfile ?? ''} hint="Se usa si el plan de velocidad no trae uno" />
        {brand === 'HUAWEI' && <TextField name="srvProfile" label="ont-srvprofile-id" maxLength={60} defaultValue={olt?.srvProfile ?? ''} />}
        <TextField name="defaultVlan" label="VLAN de servicio" type="number" min={1} max={4094} defaultValue={olt?.defaultVlan ?? ''} />
      </FormGrid>
      <details className="rounded-md border bg-gray-50 p-3">
        <summary className="cursor-pointer text-sm font-medium">Plantilla de comandos para autorizar (avanzado)</summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Vacía = la plantilla de {brand}. Variables: {'{frame} {slot} {port} {onuId} {serial} {desc} {lineProfile} {srvProfile} {vlan} {type}'}. Ajústala si tu firmware usa otros comandos.
        </p>
        <TextAreaField name="authTemplate" label="Plantilla" rows={8} defaultValue={olt?.authTemplate ?? ''} className="[&_textarea]:font-mono [&_textarea]:text-xs" />
        <p className="mt-1 text-xs text-muted-foreground">Plantilla de {brand} por defecto:</p>
        <pre className="mt-1 max-h-48 overflow-auto rounded bg-white p-2 text-xs">{templates[brand]}</pre>
      </details>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  )
}

/** Datos de la ONU en el sistema: cliente, modelo, plan, caja NAP, VLAN. */
export function OnuLinkFields({
  customers,
  models,
  plans,
  naps,
  values,
}: {
  customers: Option[]
  models: Option[]
  plans: Option[]
  naps: Option[]
  values?: { name?: string | null; customerId?: string | null; onuModelId?: string | null; speedPlanId?: string | null; napBoxId?: string | null; napPort?: number | null; vlan?: number | null }
}) {
  return (
    <FormGrid>
      <SelectField name="customerId" label="Cliente" options={customers} placeholder="Sin cliente" defaultValue={values?.customerId ?? ''} />
      <TextField name="name" label="Descripción" maxLength={100} defaultValue={values?.name ?? ''} hint="Vacío = nombre del cliente" />
      <SelectField name="onuModelId" label="Modelo de ONU" options={models} placeholder="—" defaultValue={values?.onuModelId ?? ''} />
      <SelectField name="speedPlanId" label="Plan de velocidad" options={plans} placeholder="Perfiles por defecto de la OLT" defaultValue={values?.speedPlanId ?? ''} />
      <SelectField name="napBoxId" label="Caja NAP" options={naps} placeholder="—" defaultValue={values?.napBoxId ?? ''} />
      <TextField name="napPort" label="Puerto en la NAP" type="number" min={1} max={128} defaultValue={values?.napPort ?? ''} />
      <TextField name="vlan" label="VLAN (opcional)" type="number" min={1} max={4094} defaultValue={values?.vlan ?? ''} hint="Vacío = la del plan o la OLT" />
    </FormGrid>
  )
}

/** Botón que abre una ventana con un formulario. */
export function DialogButton({
  label,
  title,
  action,
  children,
  submitLabel,
  variant = 'default',
  size = 'sm',
}: {
  label: string
  title: string
  action: Action
  children: React.ReactNode
  submitLabel: string
  variant?: 'default' | 'outline'
  size?: 'sm' | 'default'
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" size={size} variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} className="max-w-2xl">
        <ActionForm action={action} onSuccess={() => setOpen(false)}>
          {children}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </>
  )
}

/** Formulario simple en tarjeta (crear). */
export function InlineForm({ action, children, submitLabel }: { action: Action; children: React.ReactNode; submitLabel: string }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      {children}
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  )
}

/** Refresca la página cada cierto tiempo (datos "en vivo"). */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && router.refresh(), seconds * 1000)
    return () => clearInterval(t)
  }, [router, seconds])
  return null
}
