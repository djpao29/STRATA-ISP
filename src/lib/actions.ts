import { Prisma } from '@prisma/client'
import { z } from 'zod'

/** Estado que devuelven las Server Actions a los formularios. */
export type ActionState = {
  ok?: boolean
  message?: string
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
}

export const initialState: ActionState = {}

/** Convierte FormData en objeto, tratando cadenas vacías como ausentes. */
export function formToObject(formData: FormData) {
  const obj: Record<string, string> = {}
  formData.forEach((value, key) => {
    if (typeof value === 'string' && value.trim() !== '') obj[key] = value.trim()
  })
  return obj
}

/** Traduce errores conocidos a mensajes para el usuario. */
export function toActionError(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    return { error: 'Revisa los campos marcados.', fieldErrors: error.flatten().fieldErrors }
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return { error: 'Ya existe un registro con esos datos (valor duplicado).' }
    if (error.code === 'P2003') return { error: 'No se puede completar: hay registros relacionados.' }
    if (error.code === 'P2025') return { error: 'El registro ya no existe.' }
  }
  if (error instanceof Error && !(error instanceof Prisma.PrismaClientUnknownRequestError)) {
    // Errores lanzados a propósito con mensaje para el usuario (permisos, reglas de negocio).
    if (error.message && !error.message.includes('\n')) return { error: error.message }
  }
  console.error(error)
  return { error: 'Ocurrió un error inesperado. Inténtalo de nuevo.' }
}

// Esquemas reutilizables

/** Número obligatorio desde un campo de formulario: vacío → "Obligatorio", texto → "Debe ser un número". */
export const requiredNumber = (refine: (n: z.ZodNumber) => z.ZodNumber = (n) => n) =>
  z.preprocess(
    (v) => (v === undefined || v === '' ? undefined : Number(v)),
    refine(z.number({ required_error: 'Obligatorio', invalid_type_error: 'Debe ser un número' }))
  )

export const money = requiredNumber((n) => n.positive('Debe ser mayor que 0').max(1_000_000, 'Monto demasiado alto')).transform(
  (v) => Math.round(v * 100) / 100
)

export const optionalText = (max = 500) => z.string().max(max).optional()
