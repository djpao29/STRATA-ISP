'use client'

import Link from 'next/link'
import { Fragment, useState } from 'react'
import { Ban, CalendarX2, ChevronDown, Eye, MapPin, Pause, Phone, Play, Trash2 } from 'lucide-react'
import { ActionButton } from '@/components/forms/action-form'
import type { ActionState } from '@/lib/actions'
import { cn } from '@/lib/utils'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>

export type CustomerRowData = {
  id: string
  code: string
  name: string
  cedula: string | null
  status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'PENDING'
  zone: string | null
  phone: string
  address: string | null
  suspendedAt: string | null
  suspendedPlans: string[]
  services: Array<{ id: string; plan: string; access: string; router: string | null; active: boolean; cut: boolean }>
  pending: string | null
  pendingCount: number
  promise: string | null
}

const STATUS_BADGE: Record<CustomerRowData['status'], [string, string]> = {
  ACTIVE: ['Activo', 'bg-green-100 text-green-800'],
  SUSPENDED: ['Susp.', 'bg-red-100 text-red-700'],
  CANCELLED: ['Retirado', 'bg-gray-200 text-gray-700'],
  PENDING: ['Pendiente', 'bg-yellow-100 text-yellow-800'],
}

const iconBtn = 'h-7 w-7 p-0 rounded-md'

export function CustomerRow({ c, canWrite, setStatus, remove }: { c: CustomerRowData; canWrite: boolean; setStatus: Action; remove: Action }) {
  const [open, setOpen] = useState(false)
  const active = c.services.filter((s) => s.active).length
  const [label, color] = STATUS_BADGE[c.status]
  const badge = active === 0 ? ['Sin servicio', 'bg-gray-100 text-gray-600'] : [`${active} ${label}`, color]

  return (
    <Fragment>
      <tr className="border-b border-gray-100 align-middle hover:bg-gray-50/70">
        <td className="whitespace-nowrap px-3 py-3">
          <div className="flex items-center gap-1.5">
            {c.services.length > 0 ? (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-label={open ? 'Ocultar servicios' : 'Ver servicios'}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 print:hidden"
              >
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
              </button>
            ) : (
              <span className="w-6 print:hidden" />
            )}
            <span className="font-mono text-xs text-gray-700">{c.code}</span>
            {c.services.length > 0 && <span className="text-[11px] text-gray-400">({c.services.length} srv)</span>}
          </div>
        </td>
        <td className="px-3 py-3">
          <Link href={`/dashboard/customers/${c.id}`} className="font-semibold uppercase text-gray-900 hover:text-blue-700">
            {c.name}
          </Link>
          {c.cedula && <div className="text-xs text-gray-500">{c.cedula}</div>}
        </td>
        <td className="px-3 py-3">
          {c.zone ? (
            <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase text-slate-700">{c.zone}</span>
          ) : (
            <span className="text-xs text-amber-700">Sin zona</span>
          )}
        </td>
        <td className="px-3 py-3 text-xs">
          {c.status === 'SUSPENDED' && c.suspendedAt ? (
            <div className="flex items-start gap-1 text-red-600">
              <CalendarX2 className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>{c.suspendedAt}</strong>
                {c.suspendedPlans.length > 0 && <span className="text-red-500"> ({c.suspendedPlans.join(', ')})</span>}
              </span>
            </div>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-3 py-3 text-xs">
          <div className="flex items-center gap-1 text-gray-800">
            <Phone className="h-3 w-3 text-gray-400" />
            {c.phone || <span className="text-gray-400">Sin teléfono</span>}
          </div>
          {c.address && (
            <div className="mt-0.5 flex items-center gap-1 text-gray-500">
              <MapPin className="h-3 w-3 shrink-0 text-gray-400" />
              <span className="line-clamp-1">{c.address}</span>
            </div>
          )}
        </td>
        <td className="px-3 py-3 text-center">
          <span className={cn('inline-block whitespace-nowrap rounded px-2 py-1 text-[11px] font-semibold', badge[1])}>{badge[0]}</span>
          {c.promise && <div className="mt-1 text-[11px] text-indigo-600">Promesa {c.promise}</div>}
        </td>
        <td className="px-3 py-3">
          {c.pending ? (
            <div className="inline-block rounded bg-red-50 px-2 py-1 text-center">
              <div className="text-sm font-bold text-red-700">{c.pending}</div>
              <div className="text-[10px] text-red-500">{c.pendingCount} factura(s)</div>
            </div>
          ) : (
            <span className="text-sm font-semibold text-green-700">Al día</span>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-3 print:hidden">
          <div className="flex items-center justify-end gap-1">
            <Link
              href={`/dashboard/customers/${c.id}`}
              title="Ver cliente"
              aria-label={`Ver a ${c.name}`}
              className="flex h-7 w-7 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50"
            >
              <Eye className="h-4 w-4" />
            </Link>
            {canWrite && (c.status === 'SUSPENDED' || c.status === 'CANCELLED' || c.status === 'PENDING') && (
              <ActionButton
                action={setStatus}
                fields={{ id: c.id, status: 'ACTIVE' }}
                variant="ghost"
                className={cn(iconBtn, 'text-green-600 hover:bg-green-50')}
                title="Activar"
                aria-label={`Activar a ${c.name}`}
                confirm={`¿Activar a ${c.name}? Se reconecta en el router.`}
              >
                <Play className="h-4 w-4" />
              </ActionButton>
            )}
            {canWrite && c.status === 'ACTIVE' && (
              <ActionButton
                action={setStatus}
                fields={{ id: c.id, status: 'SUSPENDED' }}
                variant="ghost"
                className={cn(iconBtn, 'text-amber-500 hover:bg-amber-50')}
                title="Suspender"
                aria-label={`Suspender a ${c.name}`}
                confirm={`¿Suspender a ${c.name}? Se corta el servicio en el router.`}
              >
                <Pause className="h-4 w-4" />
              </ActionButton>
            )}
            {canWrite && c.status !== 'CANCELLED' && (
              <ActionButton
                action={setStatus}
                fields={{ id: c.id, status: 'CANCELLED' }}
                variant="ghost"
                className={cn(iconBtn, 'text-orange-600 hover:bg-orange-50')}
                title="Retirar"
                aria-label={`Retirar a ${c.name}`}
                confirm={`¿Retirar a ${c.name}? Se corta el servicio y queda como retirado.`}
              >
                <Ban className="h-4 w-4" />
              </ActionButton>
            )}
            {canWrite && (
              <ActionButton
                action={remove}
                fields={{ id: c.id }}
                variant="ghost"
                className={cn(iconBtn, 'text-red-600 hover:bg-red-50')}
                title="Eliminar"
                aria-label={`Eliminar a ${c.name}`}
                confirm={`¿Eliminar a ${c.name}? No se puede deshacer. Si tiene facturas o pagos, no se elimina: retíralo.`}
              >
                <Trash2 className="h-4 w-4" />
              </ActionButton>
            )}
          </div>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-gray-100 bg-gray-50/80">
          <td />
          <td colSpan={7} className="px-3 pb-3 pt-1">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {c.services.map((s) => (
                <div key={s.id} className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900">{s.plan}</span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                        !s.active ? 'bg-gray-100 text-gray-500' : s.cut ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      )}
                    >
                      {!s.active ? 'Inactivo' : s.cut ? 'Cortado' : 'Activo'}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-gray-600">{s.access}</div>
                  {s.router && <div className="text-gray-500">{s.router}</div>}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}
