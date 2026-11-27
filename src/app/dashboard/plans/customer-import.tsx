'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { Eye, Loader2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { importQueueCustomers, previewQueueCustomers, type QueuePreview } from './customer-import-actions'

type Option = { value: string; label: string }

/**
 * "Importar clientes desde MikroTik": lee las colas simples, muestra qué clientes se crearían
 * y los crea de una vez (solo en el sistema; el router no se toca).
 */
export function QueueCustomerImport({ routers, zones }: { routers: Option[]; zones: Option[] }) {
  const router = useRouter()
  const [routerId, setRouterId] = useState(routers[0]?.value ?? '')
  const [zoneId, setZoneId] = useState(zones[0]?.value ?? '')
  const [preview, setPreview] = useState<QueuePreview | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [loading, startLoading] = useTransition()
  const [saving, startSaving] = useTransition()

  const load = () =>
    startLoading(async () => {
      setErrors([])
      const r = await previewQueueCustomers(routerId)
      setPreview(r)
      if (!r.ok) toast.error(r.error)
    })

  const save = () =>
    startSaving(async () => {
      const r = await importQueueCustomers(routerId, zoneId)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(r.message, { duration: 8000 })
      setErrors(r.errors)
      setPreview(await previewQueueCustomers(routerId))
      router.refresh()
    })

  const data = preview?.ok ? preview : null

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-gray-900">Importar clientes desde MikroTik (Simple Queue)</p>
          <p className="text-xs text-gray-600">
            Crea un cliente por cada cola de <code>/queue/simple</code> con su IP y el plan de su velocidad. No cambia nada en el router.
          </p>
        </div>
        {routers.length === 0 ? (
          <p className="text-sm text-gray-600">Registra un router MikroTik primero.</p>
        ) : (
          <div className="flex gap-2">
            <select
              value={routerId}
              onChange={(e) => {
                setRouterId(e.target.value)
                setPreview(null)
              }}
              className="h-10 rounded-md border border-input bg-white px-3 text-sm"
              aria-label="Router"
            >
              {routers.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <Button type="button" onClick={load} disabled={loading || saving} className="bg-sky-600 hover:bg-sky-700">
              {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Eye className="mr-1 h-4 w-4" />}
              Ver clientes
            </Button>
          </div>
        )}
      </div>

      {data && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-gray-700">
            {data.total} cola(s) en {data.router}: <strong>{data.newCount} cliente(s) nuevo(s)</strong>
            {data.rows.length - data.newCount > 0 && `, ${data.rows.length - data.newCount} ya están en el sistema`}
            {data.ignored > 0 && `, ${data.ignored} ignorada(s) (dinámicas, de grupo, sin límite o sin una sola IP)`}.
            {data.newPlans > 0 && ` Se crearán ${data.newPlans} plan(es) con precio $0 para las velocidades que no tienen plan.`}
          </p>

          {data.rows.length > 0 && (
            <div className="max-h-80 overflow-auto rounded-md border bg-white">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Cola</th>
                    <th className="px-3 py-2">Nombre / Apellido</th>
                    <th className="px-3 py-2">IP</th>
                    <th className="px-3 py-2">Velocidad</th>
                    <th className="px-3 py-2">Plan</th>
                    <th className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.rows.map((r) => (
                    <tr key={r.ip} className={r.existing ? 'text-gray-400' : undefined}>
                      <td className="px-3 py-2">
                        {r.queue}
                        {r.disabled && <span className="ml-1 text-xs text-amber-600">(desactivada)</span>}
                      </td>
                      <td className="px-3 py-2">
                        {r.firstName} {r.lastName}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.ip}</td>
                      <td className="px-3 py-2">{r.speed}</td>
                      <td className="px-3 py-2">{r.plan ?? <span className="text-amber-700">Nuevo: {r.speed}</span>}</td>
                      <td className="px-3 py-2">{r.existing ? `Ya existe (${r.existing})` : <span className="font-medium text-green-700">Nuevo</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.newCount > 0 &&
            (zones.length === 0 ? (
              <p className="text-sm text-amber-700">Crea una zona primero: cada cliente necesita una zona de facturación.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm text-gray-700" htmlFor="import-zone">
                  Zona de los clientes
                </label>
                <select
                  id="import-zone"
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                  className="h-10 rounded-md border border-input bg-white px-3 text-sm"
                >
                  {zones.map((z) => (
                    <option key={z.value} value={z.value}>
                      {z.label}
                    </option>
                  ))}
                </select>
                <Button type="button" onClick={save} disabled={saving || loading} className="bg-green-600 hover:bg-green-700">
                  {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1 h-4 w-4" />}
                  Importar {data.newCount} cliente(s)
                </Button>
                <p className="w-full text-xs text-gray-500">
                  Quedan activos, con IP fija y sin teléfono ni factura de instalación. Completa sus datos después en Clientes.
                </p>
              </div>
            ))}

          {errors.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-red-700">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
