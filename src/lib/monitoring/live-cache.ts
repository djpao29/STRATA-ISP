/**
 * Caché corta con agrupación de peticiones en curso: si varias pestañas piden lo mismo
 * al mismo router a la vez, se hace una sola consulta y todas reciben el resultado.
 */
type Entry = { at: number; value?: unknown; pending?: Promise<unknown> }
const g = globalThis as unknown as { __wispxLiveCache?: Map<string, Entry> }
const cache = (g.__wispxLiveCache ??= new Map())

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const entry = cache.get(key)
  if (entry?.pending) return entry.pending as Promise<T>
  if (entry && 'value' in entry && now - entry.at < ttlMs) return entry.value as T

  const pending = load()
    .then((value) => {
      cache.set(key, { at: Date.now(), value })
      return value
    })
    .catch((error) => {
      cache.delete(key)
      throw error
    })
  cache.set(key, { at: now, pending })

  // Limpieza simple para que el mapa no crezca sin límite.
  if (cache.size > 500) {
    for (const [k, v] of cache) if (!v.pending && now - v.at > 60_000) cache.delete(k)
  }
  return pending
}
