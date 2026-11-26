'use client'

import { useState } from 'react'
import { Copy, Download, KeyRound } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { FormGrid, TextField } from '@/components/forms/fields'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import type { ActionState } from '@/lib/actions'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>

export function WireguardServerForm({ action, server }: { action: Action; server: { endpoint: string; port: number; network: string } | null }) {
  return (
    <ActionForm action={action}>
      <FormGrid>
        <TextField name="endpoint" label="IP pública o dominio del servidor" required defaultValue={server?.endpoint} placeholder="vpn.miisp.com o 200.1.2.3" hint="Donde los MikroTik se conectan (el servidor del sistema)" />
        <TextField name="port" label="Puerto UDP" type="number" min={1} max={65535} defaultValue={server?.port ?? 51820} hint="Ábrelo en el firewall del servidor" />
        <TextField name="network" label="Red del túnel" required defaultValue={server?.network ?? '10.200.0.0/24'} hint="Red privada que no uses en otro lado. El servidor toma la primera IP" />
      </FormGrid>
      <SubmitButton>{server ? 'Guardar cambios' : 'Crear servidor WireGuard'}</SubmitButton>
    </ActionForm>
  )
}

/** Botón «Generar script WireGuard» con la ventana del script para copiar o descargar. */
export function WireguardScriptButton({
  routerId,
  routerName,
  generate,
  disabledReason,
}: {
  routerId: string
  routerName: string
  generate: (id: string) => Promise<{ error?: string; script?: string; address?: string }>
  disabledReason?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<{ error?: string; script?: string; address?: string } | null>(null)
  const file = `wireguard-${routerName.replace(/[^\w-]+/g, '_').toLowerCase()}.rsc`
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!!disabledReason || busy}
        title={disabledReason ?? 'Script de RouterOS para conectar este MikroTik al servidor por WireGuard'}
        onClick={async () => {
          setBusy(true)
          const r = await generate(routerId)
          setBusy(false)
          if (r.error) return toast.error(r.error)
          setRes(r)
          setOpen(true)
        }}
      >
        <KeyRound className="mr-1 h-3.5 w-3.5" />
        {busy ? 'Generando…' : 'Generar script WireGuard'}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`WireGuard · ${routerName}`} className="max-w-3xl">
        {res?.script && (
          <div className="space-y-3">
            <p className="text-sm">
              IP de este router en el túnel: <strong className="font-mono">{res.address}</strong>
            </p>
            <ol className="ml-5 list-decimal space-y-1 text-sm text-muted-foreground">
              <li>
                En Winbox abre <strong>New Terminal</strong> y pega el script (o súbelo en Files y ejecuta <code>/import {file}</code>).
              </li>
              <li>
                Descarga el <strong>wg0.conf</strong> actualizado (Routers › VPN WireGuard) y aplícalo en el servidor.
              </li>
              <li>Cuando el túnel conecte, pulsa «Usar IP del túnel» para que el sistema entre al router por ahí.</li>
            </ol>
            <pre className="max-h-[50vh] overflow-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100">{res.script}</pre>
            <p className="text-xs text-amber-700">El script contiene la clave privada del router: no lo compartas por canales públicos.</p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigator.clipboard.writeText(res.script!).then(() => toast.success('Script copiado'), () => toast.error('No se pudo copiar'))}
              >
                <Copy className="mr-1 h-4 w-4" />
                Copiar
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const url = URL.createObjectURL(new Blob([res.script!], { type: 'text/plain' }))
                  const a = document.createElement('a')
                  a.href = url
                  a.download = file
                  a.click()
                  URL.revokeObjectURL(url)
                }}
              >
                <Download className="mr-1 h-4 w-4" />
                Descargar .rsc
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
