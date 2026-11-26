'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Consulta una URL cada `intervalMs` sin recargar la página.
 * - No lanza una petición nueva hasta que termina la anterior.
 * - Si cambia la URL, cancela la petición en curso y consulta la nueva de inmediato.
 * - Se detiene mientras la pestaña está oculta y vuelve a consultar al mostrarse.
 */
export function usePolling<T>(url: string | null, intervalMs: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const urlRef = useRef(url)
  const inFlight = useRef<{ url: string; controller: AbortController } | null>(null)
  urlRef.current = url

  const load = useCallback(async () => {
    const current = urlRef.current
    if (!current) return
    // Ya hay una petición viva a esta URL (una cancelada no cuenta).
    if (inFlight.current?.url === current && !inFlight.current.controller.signal.aborted) return
    inFlight.current?.controller.abort()
    const controller = new AbortController()
    inFlight.current = { url: current, controller }
    try {
      const res = await fetch(current, { cache: 'no-store', signal: controller.signal })
      const body = await res.json().catch(() => ({}))
      if (urlRef.current !== current) return
      if (res.status === 401) {
        // La sesión expiró o el usuario fue desactivado: volver al login.
        window.location.href = `/auth/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`
        return
      }
      if (!res.ok) {
        setError((body as { error?: string }).error ?? `Error ${res.status}`)
      } else {
        setData(body as T)
        setError(null)
        setUpdatedAt(new Date())
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('Sin conexión con el servidor')
    } finally {
      if (inFlight.current?.controller === controller) inFlight.current = null
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!url) return
    setLoading(true)
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const loop = async () => {
      if (cancelled) return
      if (document.visibilityState === 'visible') await load()
      if (!cancelled) timer = setTimeout(loop, intervalMs)
    }
    loop()
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [url, intervalMs, load])

  // Al desmontar, cancelar lo pendiente.
  useEffect(() => () => inFlight.current?.controller.abort(), [])

  return { data, error, loading, updatedAt, reload: load }
}
