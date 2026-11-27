'use client'

import { Download } from 'lucide-react'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { importPppProfiles, importSimpleQueues } from './actions'

/**
 * "Importar planes desde MikroTik" (solo lectura en el router):
 * - PPPoE: lee /ppp/profile y crea un plan por perfil.
 * - Simple Queue: lee /queue/simple y crea un plan por cada velocidad distinta de las colas.
 */
export function ImportProfilesForm({ routers, kind }: { routers: Array<{ value: string; label: string }>; kind: 'PPPOE' | 'SIMPLE_QUEUE' }) {
  const pppoe = kind === 'PPPOE'
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-5 py-4">
      <ActionForm
        key={kind}
        action={pppoe ? importPppProfiles : importSimpleQueues}
        className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="font-semibold text-gray-900">Importar planes desde MikroTik ({pppoe ? 'PPPoE' : 'Simple Queue'})</p>
          {pppoe ? (
            <p className="text-xs text-gray-600">
              Lee los perfiles <code>/ppp/profile</code> y crea planes PPPoE con su velocidad (precio $0, ponlo después).
            </p>
          ) : (
            <p className="text-xs text-gray-600">
              Lee las colas <code>/queue/simple</code> y crea un plan Simple Queue por cada velocidad distinta, con su ráfaga y
              prioridad (precio $0, ponlo después).
            </p>
          )}
        </div>
        {routers.length === 0 ? (
          <p className="text-sm text-gray-600">Registra un router MikroTik primero.</p>
        ) : (
          <div className="flex gap-2">
            <select name="routerId" defaultValue={routers[0].value} className="h-10 rounded-md border border-input bg-white px-3 text-sm" aria-label="Router">
              {routers.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <SubmitButton className="bg-green-600 hover:bg-green-700">
              <Download className="mr-1 h-4 w-4" />
              Importar planes
            </SubmitButton>
          </div>
        )}
      </ActionForm>
    </div>
  )
}
