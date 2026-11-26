'use client'

import { Download } from 'lucide-react'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { importPppProfiles } from './actions'

/** "Importar planes desde MikroTik": lee /ppp/profile (solo lectura) y crea planes PPPoE. */
export function ImportProfilesForm({ routers }: { routers: Array<{ value: string; label: string }> }) {
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-5 py-4">
      <ActionForm action={importPppProfiles} className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-gray-900">Importar planes desde MikroTik</p>
          <p className="text-xs text-gray-600">
            Lee los perfiles <code>/ppp/profile</code> y crea planes PPPoE con su velocidad (precio $0, ponlo después).
          </p>
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
