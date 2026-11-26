'use client'

import { CheckboxField, FormGrid, SelectField, TextAreaField, TextField } from '@/components/forms/fields'

type Option = { value: string; label: string }
const BRANDS: Option[] = [
  { value: 'HUAWEI', label: 'Huawei' },
  { value: 'ZTE', label: 'ZTE' },
  { value: 'VSOL', label: 'VSOL' },
]

export function ModelFields({ v }: { v?: { name: string; brand: string | null; oltType: string | null; ethPorts: number; potsPorts: number; wifi: boolean; catv: boolean; notes: string | null } }) {
  return (
    <>
      <FormGrid>
        <TextField name="name" label="Nombre" required maxLength={80} defaultValue={v?.name} placeholder="HG8145V5" />
        <SelectField name="brand" label="Marca" options={BRANDS} placeholder="Cualquiera" defaultValue={v?.brand ?? ''} />
        <TextField name="oltType" label="Tipo en la OLT" maxLength={60} defaultValue={v?.oltType ?? ''} hint="ZTE: el «type» del comando onu (ej. ZTE-F660). Huawei: equipment ID." />
        <TextField name="ethPorts" label="Puertos LAN" type="number" min={0} max={16} defaultValue={v?.ethPorts ?? 1} />
        <TextField name="potsPorts" label="Puertos telefónicos" type="number" min={0} max={8} defaultValue={v?.potsPorts ?? 0} />
      </FormGrid>
      <div className="flex gap-6">
        <CheckboxField name="wifi" label="Wi-Fi" defaultChecked={v?.wifi} />
        <CheckboxField name="catv" label="CATV" defaultChecked={v?.catv} />
      </div>
      <TextAreaField name="notes" label="Notas" rows={2} maxLength={500} defaultValue={v?.notes ?? ''} />
    </>
  )
}

export function SpeedPlanFields({ v }: { v?: { name: string; download: number; upload: number; lineProfile: string | null; srvProfile: string | null; vlan: number | null; notes: string | null } }) {
  return (
    <>
      <FormGrid>
        <TextField name="name" label="Nombre" required maxLength={80} defaultValue={v?.name} placeholder="FTTH 50M" />
        <TextField name="vlan" label="VLAN" type="number" min={1} max={4094} defaultValue={v?.vlan ?? ''} />
        <TextField name="download" label="Bajada (Mbps)" required type="number" min={1} defaultValue={v?.download} />
        <TextField name="upload" label="Subida (Mbps)" required type="number" min={1} defaultValue={v?.upload} />
        <TextField name="lineProfile" label="Perfil de línea / tcont" maxLength={60} defaultValue={v?.lineProfile ?? ''} hint="Huawei: ont-lineprofile-id · ZTE: perfil tcont · VSOL: profile" />
        <TextField name="srvProfile" label="Perfil de servicio" maxLength={60} defaultValue={v?.srvProfile ?? ''} hint="Huawei: ont-srvprofile-id" />
      </FormGrid>
      <TextAreaField name="notes" label="Notas" rows={2} maxLength={500} defaultValue={v?.notes ?? ''} />
    </>
  )
}

export function NapFields({
  olts,
  v,
}: {
  olts: Option[]
  v?: { name: string; coordinates: string | null; address: string | null; capacity: number; splitter: string | null; oltId: string | null; ponSlot: number | null; ponPort: number | null; notes: string | null }
}) {
  return (
    <>
      <FormGrid>
        <TextField name="name" label="Nombre / código" required maxLength={80} defaultValue={v?.name} placeholder="NAP-01 Calle 5" />
        <TextField name="coordinates" label="Ubicación (lat,lng)" defaultValue={v?.coordinates ?? ''} placeholder="18.4861,-69.9312" />
        <TextField name="capacity" label="Puertos" type="number" min={1} max={128} defaultValue={v?.capacity ?? 8} />
        <TextField name="splitter" label="Splitter" maxLength={20} defaultValue={v?.splitter ?? ''} placeholder="1:8" />
        <SelectField name="oltId" label="OLT" options={olts} placeholder="—" defaultValue={v?.oltId ?? ''} />
        <div className="grid grid-cols-2 gap-2">
          <TextField name="ponSlot" label="Slot" type="number" min={0} defaultValue={v?.ponSlot ?? ''} />
          <TextField name="ponPort" label="Puerto PON" type="number" min={0} defaultValue={v?.ponPort ?? ''} />
        </div>
      </FormGrid>
      <TextField name="address" label="Dirección / referencia" maxLength={200} defaultValue={v?.address ?? ''} />
      <TextAreaField name="notes" label="Notas" rows={2} maxLength={500} defaultValue={v?.notes ?? ''} />
    </>
  )
}
