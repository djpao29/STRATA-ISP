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
  { value: 'HIOSO', label: 'Hioso (EPON)' },
  { value: 'CDATA', label: 'C-Data (FD11xx / FD16xx)' },
  { value: 'BDCOM', label: 'BDCOM (P3310 / P3608)' },
]
const SNMP_BRANDS = ['HUAWEI', 'ZTE']
const EPON_BRANDS = ['HIOSO', 'CDATA', 'BDCOM']

export type OltValues = {
  name: string
  brand: string
  vendor: string | null
  softwareVersion: string | null
  ponType: string
  host: string
  port: number
  snmpVersion: string
  snmpV3User: string | null
  snmpV3Level: string | null
  snmpV3AuthProto: string | null
  snmpV3PrivProto: string | null
  hasV3Keys: boolean
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
  readTemplate: string | null
  autofindTemplate: string | null
}

export type TemplateSet = { auth: Record<string, string>; read: Record<string, string>; autofind: Record<string, string> }

export function OltForm({ action, olt, templates, submitLabel }: { action: Action; olt?: OltValues; templates: TemplateSet; submitLabel: string }) {
  const [brand, setBrand] = useState(olt?.brand ?? 'HUAWEI')
  const [proto, setProto] = useState(olt?.cliProtocol ?? 'TELNET')
  const [snmpV, setSnmpV] = useState(olt?.snmpVersion ?? '2c')
  const [level, setLevel] = useState(olt?.snmpV3Level ?? 'authPriv')
  const bySnmp = SNMP_BRANDS.includes(brand)
  return (
    <ActionForm action={action}>
      <h3 className="text-sm font-semibold">Equipo</h3>
      <FormGrid>
        <TextField name="name" label="Nombre" required maxLength={100} defaultValue={olt?.name} placeholder="OLT Central" />
        <SelectField name="brand" label="Marca" required options={BRANDS} value={brand} onChange={(e) => setBrand(e.target.value)} />
        <TextField name="vendor" label="Modelo" maxLength={60} defaultValue={olt?.vendor ?? ''} placeholder={brand === 'HIOSO' ? 'HA7304' : 'MA5608T'} />
        <TextField name="softwareVersion" label="Versión de software" maxLength={60} defaultValue={olt?.softwareVersion ?? ''} placeholder="V2.1.0" />
        <SelectField
          name="ponType"
          label="Tipo de PON"
          options={[
            { value: 'GPON', label: 'GPON (ONUs por serial)' },
            { value: 'EPON', label: 'EPON (ONUs por MAC)' },
            { value: 'GPON_EPON', label: 'GPON + EPON' },
          ]}
          defaultValue={olt?.ponType ?? (EPON_BRANDS.includes(brand) ? 'EPON' : 'GPON')}
          key={`pon-${brand}`}
        />
        <TextField name="host" label="IP de gestión" required defaultValue={olt?.host} placeholder={brand === 'HIOSO' ? '192.168.30.85' : '10.0.0.2'} />
        <TextField name="frame" label="Frame / rack" type="number" min={0} max={15} defaultValue={olt?.frame ?? (brand === 'ZTE' ? 1 : 0)} hint="ZTE: 1 · el resto: 0" />
        <TextField name="coordinates" label="Ubicación (lat,lng)" defaultValue={olt?.coordinates ?? ''} placeholder="18.4861,-69.9312" hint="Para el Mapa FTTH" />
      </FormGrid>

      <h3 className="pt-2 text-sm font-semibold">SNMP (solo lectura){bySnmp ? ' — lectura de ONUs' : ' — modelo, firmware y tiempo encendida'}</h3>
      <FormGrid>
        <SelectField
          name="snmpVersion"
          label="Versión"
          options={[
            { value: '2c', label: 'v2c (comunidad)' },
            { value: '3', label: 'v3 (usuario y claves)' },
          ]}
          value={snmpV}
          onChange={(e) => setSnmpV(e.target.value)}
        />
        <TextField name="port" label="Puerto SNMP" type="number" min={1} max={65535} defaultValue={olt?.port ?? 161} />
        {snmpV === '2c' ? (
          <TextField
            name="community"
            label="Comunidad de lectura (Read Community)"
            type="password"
            autoComplete="off"
            required={!olt && bySnmp}
            hint={olt ? 'Vacía = conservar la actual' : bySnmp ? 'Se guarda cifrada' : 'Opcional en esta marca'}
          />
        ) : (
          <>
            <TextField name="snmpV3User" label="Usuario v3 (Read User)" required maxLength={60} defaultValue={olt?.snmpV3User ?? ''} autoComplete="off" />
            <SelectField
              name="snmpV3Level"
              label="Nivel (Authentication Level)"
              options={[
                { value: 'authPriv', label: 'AuthPriv' },
                { value: 'authNoPriv', label: 'AuthNoPriv' },
                { value: 'noAuthNoPriv', label: 'NoAuthNoPriv' },
              ]}
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            />
            {level !== 'noAuthNoPriv' && (
              <>
                <SelectField name="snmpV3AuthProto" label="Autenticación" options={[{ value: 'MD5', label: 'MD5' }, { value: 'SHA', label: 'SHA' }]} defaultValue={olt?.snmpV3AuthProto ?? 'MD5'} />
                <TextField name="snmpV3AuthKey" label="Clave de autenticación" type="password" autoComplete="new-password" hint={olt?.hasV3Keys ? 'Vacía = conservar' : 'Mínimo 8 caracteres'} />
              </>
            )}
            {level === 'authPriv' && (
              <>
                <SelectField name="snmpV3PrivProto" label="Cifrado" options={[{ value: 'DES', label: 'DES' }, { value: 'AES', label: 'AES' }]} defaultValue={olt?.snmpV3PrivProto ?? 'DES'} />
                <TextField name="snmpV3PrivKey" label="Clave de cifrado" type="password" autoComplete="new-password" hint={olt?.hasV3Keys ? 'Vacía = conservar' : 'Mínimo 8 caracteres'} />
              </>
            )}
          </>
        )}
      </FormGrid>
      <p className="text-xs text-muted-foreground">El sistema nunca escribe por SNMP: no hace falta la comunidad de escritura.</p>
      <CheckboxField name="pollEnabled" label="Leer esta OLT automáticamente" defaultChecked={olt?.pollEnabled ?? true} />

      <h3 className="pt-2 text-sm font-semibold">Consola ({bySnmp ? 'para autorizar ONUs' : 'para leer y autorizar ONUs'})</h3>
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
        <TextField name="cliUsername" label="Usuario" maxLength={60} defaultValue={olt?.cliUsername ?? ''} autoComplete="off" required={!bySnmp && !olt} />
        <TextField name="cliPassword" label="Clave" type="password" autoComplete="new-password" required={!bySnmp && !olt?.hasCliPassword} hint={olt?.hasCliPassword ? 'Vacía = conservar la actual' : 'Se guarda cifrada'} />
        <TextField name="enablePassword" label="Clave de enable (si la pide)" type="password" autoComplete="new-password" hint="Opcional" />
      </FormGrid>

      <h3 className="pt-2 text-sm font-semibold">Valores por defecto al autorizar</h3>
      <FormGrid>
        <TextField name="lineProfile" label={brand === 'HUAWEI' || brand === 'CDATA' ? 'ont-lineprofile-id' : brand === 'ZTE' ? 'Perfil tcont' : 'Perfil'} maxLength={60} defaultValue={olt?.lineProfile ?? ''} hint="Se usa si el plan de velocidad no trae uno" />
        {(brand === 'HUAWEI' || brand === 'CDATA') && <TextField name="srvProfile" label="ont-srvprofile-id" maxLength={60} defaultValue={olt?.srvProfile ?? ''} />}
        <TextField name="defaultVlan" label="VLAN de servicio" type="number" min={1} max={4094} defaultValue={olt?.defaultVlan ?? ''} />
      </FormGrid>

      {!bySnmp && (
        <details className="rounded-md border bg-gray-50 p-3" open={!olt}>
          <summary className="cursor-pointer text-sm font-medium">Comandos de lectura por consola</summary>
          <p className="mt-2 text-xs text-muted-foreground">
            Uno por línea. Vacíos = los sugeridos para {brand}. Los comandos cambian según modelo y firmware: después de guardar, usa «Probar consola» en la página de la OLT para ver la respuesta real y ajustarlos.
            El sistema reconoce en la salida la posición PON (EPON0/1:3, 0/1/2:5…), el serial o la MAC, el estado y la señal.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <TextAreaField name="readTemplate" label="ONUs autorizadas" rows={5} defaultValue={olt?.readTemplate ?? ''} className="[&_textarea]:font-mono [&_textarea]:text-xs" />
              <pre className="mt-1 rounded bg-white p-2 text-xs text-muted-foreground">{templates.read[brand] ?? '—'}</pre>
            </div>
            <div>
              <TextAreaField name="autofindTemplate" label="ONUs sin autorizar" rows={5} defaultValue={olt?.autofindTemplate ?? ''} className="[&_textarea]:font-mono [&_textarea]:text-xs" />
              <pre className="mt-1 rounded bg-white p-2 text-xs text-muted-foreground">{templates.autofind[brand] ?? '—'}</pre>
            </div>
          </div>
        </details>
      )}

      <details className="rounded-md border bg-gray-50 p-3">
        <summary className="cursor-pointer text-sm font-medium">Plantilla de comandos para autorizar (avanzado)</summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Vacía = la plantilla de {brand}. Variables: {'{frame} {slot} {port} {onuId} {serial} {desc} {lineProfile} {srvProfile} {vlan} {type}'} y, para EPON,{' '}
          {'{mac} {macDot} {macDash} {macPlain}'}. Ajústala si tu firmware usa otros comandos.
        </p>
        <TextAreaField name="authTemplate" label="Plantilla" rows={8} defaultValue={olt?.authTemplate ?? ''} className="[&_textarea]:font-mono [&_textarea]:text-xs" />
        <p className="mt-1 text-xs text-muted-foreground">Plantilla de {brand} por defecto:</p>
        <pre className="mt-1 max-h-48 overflow-auto rounded bg-white p-2 text-xs">{templates.auth[brand]}</pre>
      </details>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  )
}

/** «Probar consola» y «Probar SNMP» en la página de la OLT. */
export function OltProbes({
  oltId,
  defaultCommands,
  probeConsole,
  probeSnmp,
}: {
  oltId: string
  defaultCommands: string
  probeConsole: (id: string, commands: string) => Promise<{ error?: string; output?: string; onus?: string[]; onuCount?: number; discovered?: string[] }>
  probeSnmp: (id: string) => Promise<{ error?: string; info?: { descr: string | null; name: string | null; uptimeSec: number | null } }>
}) {
  const [cmds, setCmds] = useState(defaultCommands)
  const [res, setRes] = useState<Awaited<ReturnType<typeof probeConsole>> | null>(null)
  const [snmpRes, setSnmpRes] = useState<Awaited<ReturnType<typeof probeSnmp>> | null>(null)
  const [busy, setBusy] = useState<'cli' | 'snmp' | null>(null)
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Probar SNMP</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={async () => {
              setBusy('snmp')
              setSnmpRes(await probeSnmp(oltId))
              setBusy(null)
            }}
          >
            {busy === 'snmp' ? 'Consultando…' : 'Probar SNMP'}
          </Button>
        </div>
        {snmpRes &&
          (snmpRes.error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{snmpRes.error}</p>
          ) : (
            <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
              Responde por SNMP. {snmpRes.info?.descr ?? 'Sin descripción'}
              {snmpRes.info?.name ? ` · ${snmpRes.info.name}` : ''}
              {snmpRes.info?.uptimeSec != null ? ` · encendida ${Math.floor(snmpRes.info.uptimeSec / 86400)} días` : ''}
            </p>
          ))}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Probar consola (solo comandos de consulta)</h3>
        <p className="text-xs text-muted-foreground">
          Ejecuta en la OLT comandos como show/display (no permite cambios) y muestra la respuesta, para comprobar los comandos de lectura y ver qué ONUs reconoce el sistema.
        </p>
        <textarea value={cmds} onChange={(e) => setCmds(e.target.value)} rows={4} className="w-full rounded-md border bg-background p-2 font-mono text-xs" />
        <Button
          type="button"
          size="sm"
          disabled={busy !== null}
          onClick={async () => {
            setBusy('cli')
            setRes(await probeConsole(oltId, cmds))
            setBusy(null)
          }}
        >
          {busy === 'cli' ? 'Ejecutando…' : 'Ejecutar'}
        </Button>
        {res &&
          (res.error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{res.error}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs">
                El sistema reconoce <strong>{res.onuCount}</strong> ONU(s) en esta salida
                {res.discovered?.length ? ` y ${res.discovered.length} sin autorizar` : ''}.
              </p>
              {res.onus && res.onus.length > 0 && <pre className="max-h-40 overflow-auto rounded bg-green-50 p-2 text-xs">{res.onus.join('\n')}</pre>}
              <pre className="max-h-96 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100">{res.output}</pre>
            </div>
          ))}
      </div>
    </div>
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
