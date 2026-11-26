'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { FileText, FolderOpen, KeyRound, Radio, Search, Spline, User, Wifi } from 'lucide-react'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/forms/fields'
import { Modal } from '@/components/ui/modal'
import type { ActionState } from '@/lib/actions'
import { cn } from '@/lib/utils'
import { CustomerInfoFields } from '../customer-fields'

type Option = { value: string; label: string; disabled?: boolean }
export type FiberOptions = { free: Option[]; discovered: Option[]; olts: Option[]; speedPlans: Option[]; naps: Option[] }
export type PlanOpt = { id: string; name: string; kind: 'SIMPLE_QUEUE' | 'PPPOE'; price: number; download: number; upload: number; pppProfile: string | null }
type Iface = { name: string; type: string; comment: string | null; running: boolean }
type Lease = { address: string; mac: string | null; hostName: string | null; status: string | null; dynamic: boolean; comment: string | null }
type IpCheck = { ip: string; inSystem: string | null; inRouter: boolean; mac: string | null; hostName: string | null; suggestion: string | null }

const input = 'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm'

function Section({ title, icon, children, className }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-3 rounded-lg border p-4', className)}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  )
}

export function NewCustomerForm({
  action,
  routers,
  plans,
  zones,
  fiber,
  deviceModels,
  currency,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  routers: Option[]
  plans: PlanOpt[]
  zones: Option[]
  fiber: FiberOptions
  deviceModels: string[]
  currency: string
}) {
  const [tab, setTab] = useState<'main' | 'extra'>('main')
  const [routerId, setRouterId] = useState('')
  const [ifaces, setIfaces] = useState<{ interfaces: Iface[]; wans: string[] } | null>(null)
  const [ifaceError, setIfaceError] = useState<string | null>(null)
  const [ip, setIp] = useState('')
  const [mac, setMac] = useState('')
  const [ipCheck, setIpCheck] = useState<IpCheck | { error: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const [leases, setLeases] = useState<Lease[] | { error: string } | null>(null)
  const [leasesOpen, setLeasesOpen] = useState(false)
  const [planId, setPlanId] = useState('')
  const [discountOpen, setDiscountOpen] = useState(false)
  const [discount, setDiscount] = useState('')
  const [access, setAccess] = useState<'FIBER' | 'ANTENNA'>('FIBER')
  const [newOnu, setNewOnu] = useState(false)
  const [onuChoice, setOnuChoice] = useState('')
  const [invoice, setInvoice] = useState(false)
  const [pppPass, setPppPass] = useState('')

  const plan = plans.find((p) => p.id === planId)
  const money = (n: number) => new Intl.NumberFormat(currency === 'DOP' ? 'es-DO' : 'es-EC', { style: 'currency', currency }).format(n)
  const finalPrice = plan ? Math.max(0, plan.price - (Number(discount) || 0)) : 0

  useEffect(() => {
    setIfaces(null)
    setIfaceError(null)
    setIpCheck(null)
    if (!routerId) return
    const ctrl = new AbortController()
    fetch(`/api/routers/${routerId}/lookup?what=interfaces`, { signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Error')
        setIfaces(j)
      })
      .catch((e) => e.name !== 'AbortError' && setIfaceError(e.message))
    return () => ctrl.abort()
  }, [routerId])

  const checkIp = async () => {
    if (!routerId) return setIpCheck({ error: 'Elige primero el MikroTik.' })
    if (!ip.trim()) return setIpCheck({ error: 'Escribe una IP (o una de la red, ej. 192.168.88.10) para buscar una libre.' })
    setChecking(true)
    try {
      const r = await fetch(`/api/routers/${routerId}/lookup?what=ip&ip=${encodeURIComponent(ip.trim())}`)
      const j = await r.json()
      setIpCheck(r.ok ? j : { error: j.error ?? 'Error' })
      if (r.ok && j.mac && !mac) setMac(j.mac)
    } finally {
      setChecking(false)
    }
  }

  const openLeases = async () => {
    if (!routerId) return setIpCheck({ error: 'Elige primero el MikroTik para ver sus leases DHCP.' })
    setLeasesOpen(true)
    setLeases(null)
    const r = await fetch(`/api/routers/${routerId}/lookup?what=leases`)
    const j = await r.json()
    setLeases(r.ok ? j.leases : { error: j.error ?? 'Error' })
  }

  const wanOptions = useMemo(() => {
    if (!ifaces) return []
    const wans = ifaces.wans.map((w) => ({ value: w, label: `${w} (WAN detectada)` }))
    return [...wans, ...ifaces.interfaces.filter((i) => !ifaces.wans.includes(i.name)).map((i) => ({ value: i.name, label: i.name }))]
  }, [ifaces])

  const generatePass = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
    const a = new Uint32Array(10)
    crypto.getRandomValues(a)
    setPppPass(Array.from(a, (n) => chars[n % chars.length]).join(''))
  }

  return (
    <ActionForm action={action} className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setTab('main')} className={cn('inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium', tab === 'main' ? 'border-gray-900 bg-gray-900 text-white' : 'bg-white hover:bg-gray-50')}>
          <User className="h-4 w-4" />
          Datos del cliente
        </button>
        <button type="button" onClick={() => setTab('extra')} className={cn('inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium', tab === 'extra' ? 'border-gray-900 bg-gray-900 text-white' : 'bg-white hover:bg-gray-50')}>
          <FolderOpen className="h-4 w-4" />
          Información adicional
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-500">opcional</span>
        </button>
      </div>

      {/* Las dos pestañas quedan en el formulario (solo se ocultan) para enviar todos los campos. */}
      <div className={cn('grid grid-cols-1 gap-8 lg:grid-cols-2', tab !== 'main' && 'hidden')}>
        <CustomerInfoFields />

        <div className="space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-900">
            <Wifi className="h-4 w-4 text-green-600" />
            Servicio y red
          </h2>
          <SelectField name="routerId" label="MikroTik / Router" options={routers} placeholder="Seleccionar…" value={routerId} onChange={(e) => setRouterId(e.target.value)} />
          {ifaceError && <p className="text-xs text-red-700">{ifaceError}</p>}

          <div className="space-y-1.5">
            <label htmlFor="ipAddress" className="text-sm font-medium">
              Dirección IP
            </label>
            <div className="flex gap-2">
              <input id="ipAddress" name="ipAddress" value={ip} onChange={(e) => { setIp(e.target.value); setIpCheck(null) }} placeholder="192.168.88.10" className={cn(input, 'font-mono')} />
              <button type="button" onClick={checkIp} disabled={checking} title="Comprobar si está libre y buscar su MAC" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-white hover:bg-gray-50 disabled:opacity-50">
                <Search className="h-4 w-4" />
              </button>
            </div>
            {ipCheck &&
              ('error' in ipCheck ? (
                <p className="text-xs text-red-700">{ipCheck.error}</p>
              ) : (
                <div className="space-y-1 rounded-md border bg-gray-50 px-3 py-2 text-xs">
                  {ipCheck.inSystem ? (
                    <p className="text-red-700">Ocupada en el sistema por {ipCheck.inSystem}.</p>
                  ) : ipCheck.inRouter ? (
                    <p className="text-amber-800">No está asignada en el sistema, pero el router la ve en uso{ipCheck.hostName ? ` (${ipCheck.hostName})` : ''}.</p>
                  ) : (
                    <p className="text-green-700">Libre en el sistema y en el router.</p>
                  )}
                  {ipCheck.mac && <p>MAC vista en el router: <span className="font-mono">{ipCheck.mac}</span></p>}
                  {(ipCheck.inSystem || ipCheck.inRouter) && ipCheck.suggestion && (
                    <button type="button" className="text-blue-700 hover:underline" onClick={() => { setIp(ipCheck.suggestion!); setIpCheck(null) }}>
                      Usar la siguiente libre: {ipCheck.suggestion}
                    </button>
                  )}
                </div>
              ))}
          </div>

          <TextField name="ipv6" label="IPv6 (opcional)" placeholder="fd00:10:0:4::10" className="[&_input]:font-mono" />

          <div className="space-y-1.5">
            <label htmlFor="macAddress" className="text-sm font-medium">
              MAC CPE (opcional)
            </label>
            <div className="flex gap-2">
              <input id="macAddress" name="macAddress" value={mac} onChange={(e) => setMac(e.target.value)} placeholder="aa:bb:cc:dd:ee:ff" className={cn(input, 'font-mono')} />
              <button type="button" onClick={checkIp} disabled={checking} title="Buscar la MAC de la IP en el router" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-white hover:bg-gray-50 disabled:opacity-50">
                <Search className="h-4 w-4" />
              </button>
            </div>
            <button type="button" onClick={openLeases} className="text-xs text-blue-700 hover:underline">
              Ver leases DHCP
            </button>
          </div>

          <SelectField
            name="lanInterface"
            label="Interfaz LAN (opcional)"
            placeholder={routerId ? (ifaces ? 'Sin interfaz' : 'Cargando…') : 'Sin interfaz'}
            options={(ifaces?.interfaces ?? []).map((i) => ({ value: i.name, label: `${i.name}${i.comment ? ` · ${i.comment}` : ''}${i.running ? '' : ' (sin enlace)'}` }))}
          />
          <SelectField name="wanInterface" label="WAN preferida (opcional)" placeholder="AUTO" options={wanOptions} hint="Referencia para el técnico; el sistema no cambia el enrutamiento del router" />

          <div className="space-y-1.5">
            <label htmlFor="planId" className="text-sm font-medium">
              Plan de Internet
            </label>
            <select id="planId" name="planId" value={planId} onChange={(e) => setPlanId(e.target.value)} className={cn(input, planId === '' && 'text-muted-foreground')}>
              <option value="">Seleccione plan…</option>
              {(['SIMPLE_QUEUE', 'PPPOE'] as const).map((k) => (
                <optgroup key={k} label={k === 'PPPOE' ? 'PPPoE' : 'Simple Queue'}>
                  {plans
                    .filter((p) => p.kind === k)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.download}/{p.upload} Mbps · {p.price > 0 ? money(p.price) : 'sin precio'}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            {plan && plan.price <= 0 && <p className="text-xs text-amber-700">Este plan no tiene precio: no se facturará hasta ponérselo en Planes.</p>}
          </div>

          {plan?.kind === 'PPPOE' && (
            <Section title="Usuario PPPoE" icon={<KeyRound className="h-4 w-4 text-blue-600" />}>
              <input type="hidden" name="mode" value="PPPoE" />
              <TextField name="pppoeUser" label="Usuario" required maxLength={100} placeholder="juan.perez" autoComplete="off" />
              <div className="space-y-1.5">
                <label htmlFor="pppoePassword" className="text-sm font-medium">
                  Clave
                </label>
                <div className="flex gap-2">
                  <input id="pppoePassword" name="pppoePassword" value={pppPass} onChange={(e) => setPppPass(e.target.value)} autoComplete="new-password" className={cn(input, 'font-mono')} maxLength={64} />
                  <button type="button" onClick={generatePass} className="shrink-0 rounded-md border bg-white px-3 text-xs hover:bg-gray-50">
                    Generar
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Se usa para crear el usuario en el MikroTik con el perfil «{plan.pppProfile || plan.name}». Si el usuario ya existe, solo se le asigna el perfil.</p>
              </div>
            </Section>
          )}
          {plan?.kind === 'SIMPLE_QUEUE' && (
            <SelectField name="mode" label="Modo de conexión" options={[{ value: 'STATIC_IP', label: 'IP fija' }, { value: 'DHCP', label: 'DHCP' }]} defaultValue="STATIC_IP" hint="La cola simple se crea para la IP indicada" />
          )}

          {plan && (
            <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-4">
              {!discountOpen ? (
                <button type="button" onClick={() => setDiscountOpen(true)} className="rounded-md bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800">
                  Aplicar descuento
                </button>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <TextField name="discount" label={`Descuento mensual (${currency})`} type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                    <TextField name="discountNote" label="Motivo" maxLength={120} placeholder="Ej: cliente referido" />
                  </div>
                  <p className="text-sm">
                    Precio final: <strong>{money(finalPrice)}</strong> <span className="text-muted-foreground">(plan {money(plan.price)})</span>
                  </p>
                  <button type="button" onClick={() => { setDiscountOpen(false); setDiscount('') }} className="text-xs text-red-700 hover:underline">
                    Quitar descuento
                  </button>
                </>
              )}
            </div>
          )}

          <SelectField name="zoneId" label="Zona" required options={zones} placeholder="Seleccionar…" />

          <div className="space-y-1.5">
            <label htmlFor="deviceModel" className="text-sm font-medium">
              Modelo de Router <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <input id="deviceModel" name="deviceModel" list="device-models" maxLength={60} placeholder="Ej. TP-Link Archer C6" className={input} />
            <datalist id="device-models">
              {deviceModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">Escribe el modelo o elige uno ya usado. Se guarda en «Wifi Router» del cliente.</p>
          </div>

          <Section title="Tipo de acceso del cliente" icon={<Spline className="h-4 w-4 text-blue-600" />}>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['FIBER', 'Fibra (OLT / ONU)', <Spline key="f" className="h-4 w-4" />],
                  ['ANTENNA', 'Antena', <Radio key="a" className="h-4 w-4" />],
                ] as const
              ).map(([v, label, icon]) => (
                <label key={v} className={cn('flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium', access === v ? 'border-blue-600 bg-blue-50' : 'hover:bg-gray-50')}>
                  <input type="radio" name="accessType" value={v} checked={access === v} onChange={() => setAccess(v)} />
                  {icon}
                  {label}
                </label>
              ))}
            </div>
            {access === 'FIBER' ? (
              <div className="space-y-2">
                {!newOnu ? (
                  <>
                    <div className="space-y-1.5">
                      <label htmlFor="onuChoice" className="text-sm font-medium">
                        ONU
                      </label>
                      <select id="onuChoice" name="onuChoice" value={onuChoice} onChange={(e) => setOnuChoice(e.target.value)} className={input}>
                        <option value="">— Sin vincular ONU por ahora —</option>
                        {fiber.discovered.length > 0 && (
                          <optgroup label="Detectadas sin autorizar (se autorizan al guardar)">
                            {fiber.discovered.map((o) => (
                              <option key={o.value} value={o.value} disabled={o.disabled}>
                                {o.label}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {fiber.free.length > 0 && (
                          <optgroup label="Autorizadas sin cliente">
                            {fiber.free.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      {onuChoice.startsWith('disc:') && <p className="text-xs text-green-700">Al guardar se autoriza en la OLT con el plan de velocidad elegido.</p>}
                    </div>
                    {fiber.free.length + fiber.discovered.length === 0 && (
                      <p className="text-xs text-amber-700">Sin ONUs libres ni detectadas — usa «Autorizar ONU» con el serial de la etiqueta.</p>
                    )}
                    <button type="button" onClick={() => { setNewOnu(true); setOnuChoice('') }} disabled={fiber.olts.length === 0} className="rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-50 disabled:opacity-50">
                      Autorizar ONU
                    </button>
                    {fiber.olts.length === 0 && <p className="text-xs text-muted-foreground">Registra primero una OLT en el menú OLT.</p>}
                  </>
                ) : (
                  <div className="space-y-2 rounded-md border bg-gray-50 p-3">
                    <input type="hidden" name="newOnu" value="on" />
                    <SelectField name="onuOltId" label="OLT" required options={fiber.olts} defaultValue={fiber.olts[0]?.value} />
                    <TextField name="onuSerial" label="Serial (GPON) o MAC (EPON) de la ONU" required maxLength={17} placeholder="HWTC1A2B3C4D o 00:1E:A5:11:22:33" className="[&_input]:font-mono [&_input]:uppercase" />
                    <p className="text-xs text-muted-foreground">
                      Si la OLT ya la detecta, se autoriza al guardar; si todavía no está conectada, queda pre-autorizada y se autoriza sola cuando aparezca.
                    </p>
                    <button type="button" onClick={() => setNewOnu(false)} className="text-xs text-red-700 hover:underline">
                      Cancelar
                    </button>
                  </div>
                )}
                {(newOnu || onuChoice) && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <SelectField name="oltSpeedPlanId" label="Plan de velocidad OLT" options={fiber.speedPlans} placeholder="Perfiles de la OLT" className="sm:col-span-3" />
                    <div className="space-y-1.5 sm:col-span-2">
                      <label htmlFor="napBoxId" className="text-sm font-medium">
                        Caja NAP
                      </label>
                      <select id="napBoxId" name="napBoxId" defaultValue="" className={input}>
                        <option value="">—</option>
                        {fiber.naps.map((n) => (
                          <option key={n.value} value={n.value} disabled={n.disabled}>
                            {n.label}
                            {n.disabled ? ' · llena' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <TextField name="napPort" label="Puerto" type="number" min={1} max={128} />
                  </div>
                )}
              </div>
            ) : (
              <TextField name="accessPoint" label="AP / sector" maxLength={100} placeholder="Ej: Torre norte · Sector 2" />
            )}
          </Section>

          <Section title="Sincronización con MikroTik">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="syncRouter" value="on" defaultChecked />
              Panel + MikroTik
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="syncRouter" value="off" />
              Solo panel
            </label>
            <p className="text-xs text-muted-foreground">
              Con «Panel + MikroTik» se crea en el router la cola simple (planes Simple Queue) o el usuario PPPoE con su perfil (planes PPPoE).
            </p>
          </Section>

          <Section title="Factura en la instalación (opcional)" icon={<FileText className="h-4 w-4 text-green-700" />} className="border-green-200 bg-green-50/50">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="invoiceNow" value="on" checked={invoice} onChange={(e) => setInvoice(e.target.checked)} />
              Generar factura al guardar
            </label>
            {invoice ? (
              <div className="space-y-1 pl-6 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="invoiceMode" value="prorated" defaultChecked />
                  Proporcional: desde hoy hasta el próximo ciclo de su zona
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="invoiceMode" value="full" />
                  Mes completo (precio del plan)
                </label>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Sin marcar, la primera factura la genera su zona en el próximo ciclo.</p>
            )}
          </Section>
        </div>
      </div>

      <div className={cn('max-w-2xl space-y-4', tab !== 'extra' && 'hidden')}>
        <SelectField
          name="status"
          label="Estado inicial"
          options={[
            { value: 'ACTIVE', label: 'Activo (ya instalado)' },
            { value: 'PENDING', label: 'Pendiente de instalación' },
          ]}
          defaultValue="ACTIVE"
        />
        <TextAreaField name="notes" label="Notas internas" rows={4} maxLength={2000} />
        <CheckboxField name="suspendExempt" label="Exento de corte automático (nunca cortar a este cliente por falta de pago)" />
      </div>

      <div className="flex items-center justify-end gap-3 border-t pt-4">
        <Link href="/dashboard/customers" className="px-3 text-sm text-gray-700 hover:underline">
          Cancelar
        </Link>
        <SubmitButton className="bg-blue-600 px-6 hover:bg-blue-700">Guardar cliente</SubmitButton>
      </div>

      <Modal open={leasesOpen} onClose={() => setLeasesOpen(false)} title="Leases DHCP" className="max-w-2xl">
        {leases === null ? (
          <p className="text-sm text-muted-foreground">Consultando el router…</p>
        ) : 'error' in leases ? (
          <p className="text-sm text-red-700">{leases.error}</p>
        ) : leases.length === 0 ? (
          <p className="text-sm text-muted-foreground">El router no tiene leases DHCP.</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs text-gray-500">
                <tr>
                  <th className="py-2">IP</th>
                  <th>MAC</th>
                  <th>Equipo</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {leases.map((l) => (
                  <tr key={`${l.address}-${l.mac}`}>
                    <td className="py-1.5 font-mono text-xs">{l.address}</td>
                    <td className="font-mono text-xs">{l.mac ?? '—'}</td>
                    <td className="text-xs">{l.hostName ?? l.comment ?? '—'}</td>
                    <td className="text-xs">{l.status ?? '—'}{l.dynamic ? '' : ' · fija'}</td>
                    <td className="text-right">
                      <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => { setIp(l.address); if (l.mac) setMac(l.mac); setIpCheck(null); setLeasesOpen(false) }}>
                        Usar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </ActionForm>
  )
}
