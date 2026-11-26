'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Info, AlertOctagon, X } from 'lucide-react'
import type { NoticeSeverity } from '@prisma/client'
import { dismissNotice } from '@/app/dashboard/customers/notices/actions'
import { cn } from '@/lib/utils'

export type BannerNotice = { id: string; title: string; message: string; severity: NoticeSeverity; dismissible: boolean }

const STYLE: Record<NoticeSeverity, { cls: string; Icon: typeof Info }> = {
  INFO: { cls: 'border-blue-200 bg-blue-50 text-blue-900', Icon: Info },
  WARNING: { cls: 'border-amber-200 bg-amber-50 text-amber-900', Icon: AlertTriangle },
  CRITICAL: { cls: 'border-red-300 bg-red-50 text-red-900', Icon: AlertOctagon },
}

/** Avisos para el personal, arriba del contenido de cada pantalla del panel. */
export function NoticeBanner({ notices }: { notices: BannerNotice[] }) {
  const [hidden, setHidden] = useState<string[]>([])
  const [, start] = useTransition()
  const visible = notices.filter((n) => !hidden.includes(n.id))
  if (visible.length === 0) return null
  return (
    <div className="mb-4 space-y-2">
      {visible.map((n) => {
        const { cls, Icon } = STYLE[n.severity]
        return (
          <div key={n.id} role={n.severity === 'CRITICAL' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-md border px-4 py-3 text-sm', cls)}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{n.title}</p>
              <p className="whitespace-pre-line">{n.message}</p>
            </div>
            {n.dismissible && (
              <button
                type="button"
                title="Ocultar este aviso"
                className="shrink-0 rounded p-1 opacity-70 hover:bg-black/5 hover:opacity-100"
                onClick={() => {
                  setHidden((h) => [...h, n.id])
                  start(async () => {
                    await dismissNotice(n.id)
                  })
                }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
