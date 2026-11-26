import { z } from 'zod'

/** Política de contraseñas de usuarios. */
export const passwordRule = z
  .string({ required_error: 'Obligatorio' })
  .min(10, 'Mínimo 10 caracteres')
  .max(200)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Debe tener letras y números')
