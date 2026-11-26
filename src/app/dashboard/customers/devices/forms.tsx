'use client'

import { useState, useTransition } from 'react'
import { Copy, Eye, EyeOff } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { CheckboxField, FormGrid, SelectField, TextAreaField, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'
import { revealDeviceSecret } from './actions'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>
type Option = { value: string; label: string }

export type DeviceValues = {
  customerId: string
  serviceId: string | null
  brand: string | null
  model: string | null
  serial: string | null
  macAddress: string | null
  managementIp: string | null
  ssid: string | null
  adminUser: string | null
  band: string | null
  notes: string | null
  hasWifiPassword: boolean
  hasAdminPassword: boolean
}

const BANDS = ['2.4 GHz', '5 GHz', '2.4 y 5 GHz'].map((b) => ({ value: b, label: b }))

/**
 * Formulario de equipo. Si `customers` viene, se elige el cliente; si no, el cliente es fijo (`values.customerId`).
 * En edición las claves vacías se conservan.
 */
export function DeviceForm({
  action,
  customers,
  services,
  values,
  submitLabel,
  fixedCustomerId,
}: {
  action: Action
  customers?: Option[]
  services?: Option[]
  values?: DeviceValues
  submitLabel: string
  fixedCustomerId?: string
}) {
  const editing = !!values
  return (
    <ActionForm action={action} resetOnSuccess={!editing}>
      <FormGrid>
        {customers ? (
          <SelectField name="customerId" label="Cliente" required options={customers} placeholder="Elegir cliente…" defaultValue={values?.customerId ?? ''} />
        ) : (
          <input type="hidden" name="customerId" value={values?.customerId ?? fixedCustomerId ?? ''} />
        )}
        {services && services.length > 0 && (
          <SelectField name="serviceId" label="Servicio" options={services} placeholder="Sin servicio específico" defaultValue={values?.serviceId ?? ''} />
        )}
        <TextField name="brand" label="Marca" maxLength={60} placeholder="TP-Link, Mercusys, Tenda…" defaultValue={values?.brand ?? ''} />
        <TextField name="model" label="Modelo" maxLength={60} defaultValue={values?.model ?? ''} />
        <TextField name="serial" label="Número de serie" maxLength={80} defaultValue={values?.serial ?? ''} />
        <TextField name="macAddress" label="MAC" placeholder="AA:BB:CC:DD:EE:FF" defaultValue={values?.macAddress ?? ''} />
        <TextField name="managementIp" label="IP de administración" placeholder="192.168.0.1" defaultValue={values?.managementIp ?? ''} />
        <SelectField name="band" label="Banda" options={BANDS} placeholder="—" defaultValue={values?.band ?? ''} />
        <TextField name="ssid" label="Nombre de la red (SSID)" maxLength={64} defaultValue={values?.ssid ?? ''} />
        <TextField
          name="wifiPassword"
          label="Clave WiFi"
          type="password"
          autoComplete="new-password"
          maxLength={63}
          hint={editing ? (values.hasWifiPassword ? 'Déjala vacía para conservar la actual' : 'Sin clave guardada') : 'Se guarda cifrada'}
        />
        <TextField name="adminUser" label="Usuario de administración" maxLength={60} defaultValue={values?.adminUser ?? ''} />
        <TextField
          name="adminPassword"
          label="Clave de administración"
          type="password"
          autoComplete="new-password"
          maxLength={120}
          hint={editing ? (values.hasAdminPassword ? 'Déjala vacía para conservar la actual' : 'Sin clave guardada') : 'Se guarda cifrada'}
        />
      </FormGrid>
      <TextAreaField name="notes" label="Notas" rows={2} maxLength={1000} placeholder="Ubicación del equipo, canal, observaciones…" defaultValue={values?.notes ?? ''} />
      {editing && (values.hasWifiPassword || values.hasAdminPassword) && (
        <div className="flex flex-wrap gap-4">
          {values.hasWifiPassword && <CheckboxField name="clearWifi" label="Borrar la clave WiFi guardada" />}
          {values.hasAdminPassword && <CheckboxField name="clearAdmin" label="Borrar la clave de administración guardada" />}
        </div>
      )}
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  )
}

/** Muestra una clave cifrada solo cuando se pide; la consulta queda en la auditoría. */
export function RevealSecret({ id, which }: { id: string; which: 'wifi' | 'admin' }) {
  const [value, setValue] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (value !== null) {
    return (
      <span className="inline-flex items-center gap-1">
        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{value}</code>
        <button
          type="button"
          title="Copiar"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => navigator.clipboard.writeText(value).then(() => toast.success('Copiada'), () => toast.error('No se pudo copiar'))}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Ocultar" className="text-muted-foreground hover:text-foreground" onClick={() => setValue(null)}>
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      </span>
    )
  }
  return (
    <button
      type="button"
      disabled={pending}
      className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline disabled:opacity-50"
      onClick={() =>
        start(async () => {
          const r = await revealDeviceSecret(id, which)
          if (r.error) toast.error(r.error)
          else setValue(r.value ?? '')
        })
      }
    >
      <Eye className="h-3.5 w-3.5" />
      {pending ? 'Leyendo…' : 'Ver'}
    </button>
  )
}
