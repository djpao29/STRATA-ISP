'use client'

import { useState } from 'react'
import { Plus, User, X } from 'lucide-react'
import type { Customer } from '@prisma/client'
import { TextField } from '@/components/forms/fields'
import { LocationPicker } from '@/components/maps/location-picker'

/** Campo con botón "+" para mostrar uno secundario (correo o teléfono). */
function WithSecondary({
  primary,
  secondary,
  initiallyOpen,
  addLabel,
}: {
  primary: React.ReactNode
  secondary: React.ReactNode
  initiallyOpen: boolean
  addLabel: string
}) {
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">{primary}</div>
        <button
          type="button"
          title={open ? 'Quitar' : addLabel}
          onClick={() => setOpen((v) => !v)}
          className="mb-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-white text-gray-600 hover:bg-gray-50"
        >
          {open ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>
      {open && secondary}
    </div>
  )
}

/** Datos personales y ubicación del cliente. */
export function CustomerInfoFields({ customer }: { customer?: Customer }) {
  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 font-semibold text-gray-900">
        <User className="h-4 w-4 text-blue-600" />
        Información del cliente
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <TextField name="firstName" label="Nombre" required maxLength={100} placeholder="Ej: Juan" defaultValue={customer?.firstName} />
        <TextField name="lastName" label="Apellido" required maxLength={100} placeholder="Ej: Pérez" defaultValue={customer?.lastName} />
      </div>
      <TextField name="cedula" label="Cédula / CI / DNI" maxLength={20} placeholder="Opcional" defaultValue={customer?.cedula ?? ''} />
      <WithSecondary
        addLabel="Agregar otro correo"
        initiallyOpen={!!customer?.email2}
        primary={<TextField name="email" label="Email (opcional)" type="email" placeholder="juan@ejemplo.com" defaultValue={customer?.email ?? ''} />}
        secondary={<TextField name="email2" label="Email secundario" type="email" defaultValue={customer?.email2 ?? ''} />}
      />
      <WithSecondary
        addLabel="Agregar otro teléfono"
        initiallyOpen={!!customer?.phone2}
        primary={<TextField name="phone" label="Teléfono (sin +)" required placeholder="8095551234" defaultValue={customer?.phone} inputMode="tel" />}
        secondary={<TextField name="phone2" label="Teléfono secundario" placeholder="8295551234" defaultValue={customer?.phone2 ?? ''} inputMode="tel" />}
      />
      <p className="-mt-2 text-xs text-muted-foreground">El secundario también sirve para WhatsApp (mismo formato, sin +).</p>

      <div className="space-y-3 rounded-lg border bg-gray-50/60 p-4">
        <h3 className="text-sm font-semibold">Ubicación (opcional)</h3>
        <TextField name="address" label="Dirección" maxLength={300} placeholder="Calle, número, referencia" defaultValue={customer?.address ?? ''} />
        <div className="grid grid-cols-2 gap-3">
          <TextField name="province" label="Provincia" maxLength={100} placeholder="Ej: Santo Domingo" defaultValue={customer?.province ?? ''} />
          <TextField name="city" label="Ciudad" maxLength={100} placeholder="Ej: Santo Domingo Este" defaultValue={customer?.city ?? ''} />
        </div>
        <TextField name="neighborhood" label="Barrio / sector" maxLength={100} placeholder="Ej: Los Mina" defaultValue={customer?.neighborhood ?? ''} />
        <LocationPicker defaultValue={customer?.coordinates} />
      </div>
    </div>
  )
}
