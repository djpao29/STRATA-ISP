import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET debe tener al menos 32 caracteres'),
  NEXTAUTH_URL: z.string().url().optional(),
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'ENCRYPTION_KEY debe ser 32 bytes en base64'),
})

let cached: z.infer<typeof schema> | undefined

/**
 * Variables de entorno validadas. Se valida al primer uso (no al importar) para que
 * `next build` funcione sin secretos; en ejecución falla con un mensaje claro si falta algo.
 */
export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env)
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
      throw new Error(`Variables de entorno inválidas:\n${issues}`)
    }
    cached = parsed.data
  }
  return cached
}
