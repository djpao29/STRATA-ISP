'use client'

import type { MonitoringSettings } from '@prisma/client'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { FormGrid, TextField } from '@/components/forms/fields'
import type { ActionState } from '@/lib/actions'

export function MonitoringSettingsForm({
  action,
  settings: s,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  settings: MonitoringSettings
}) {
  return (
    <ActionForm action={action}>
      <h3 className="text-sm font-semibold">Actualización</h3>
      <FormGrid>
        <TextField name="pollIntervalSec" label="Recolección en segundo plano (segundos)" type="number" min={15} max={3600} required defaultValue={s.pollIntervalSec} hint="Cada cuánto se consulta cada router y se guarda historial (mín. 15)" />
        <TextField name="liveRefreshSec" label="Gráfico en vivo (segundos)" type="number" min={2} max={60} required defaultValue={s.liveRefreshSec} hint="Solo mientras alguien tiene abierta la página del router (mín. 2)" />
        <TextField name="requestTimeoutSec" label="Tiempo de espera por consulta (segundos)" type="number" min={2} max={55} required defaultValue={s.requestTimeoutSec} />
        <TextField name="offlineAfterFails" label="Fallos seguidos para marcar desconectado" type="number" min={1} max={10} required defaultValue={s.offlineAfterFails} hint="Evita falsas alarmas por un paquete perdido" />
        <TextField name="retentionDays" label="Días de historial guardado" type="number" min={1} max={90} required defaultValue={s.retentionDays} />
      </FormGrid>
      <h3 className="pt-2 text-sm font-semibold">Límites de alerta</h3>
      <FormGrid>
        <TextField name="cpuThreshold" label="CPU (%)" type="number" min={10} max={100} required defaultValue={s.cpuThreshold} />
        <TextField name="memThreshold" label="Memoria RAM (%)" type="number" min={10} max={100} required defaultValue={s.memThreshold} />
        <TextField name="tempThreshold" label="Temperatura (°C)" type="number" min={30} max={120} required defaultValue={s.tempThreshold} hint="Solo en equipos con sensor" />
        <TextField name="latencyThreshold" label="Tiempo de respuesta (ms)" type="number" min={50} max={60000} required defaultValue={s.latencyThreshold} />
      </FormGrid>
      <p className="text-xs text-muted-foreground">
        Las alertas de interfaz caída (WAN, SFP/SFP+) se activan por interfaz, desde la tabla de interfaces de cada router.
      </p>
      <SubmitButton>Guardar ajustes</SubmitButton>
    </ActionForm>
  )
}
