/**
 * Alta inicial: crea la empresa (tenant) y su primer administrador.
 * No carga datos de ejemplo. Uso:
 *
 *   SETUP_COMPANY_NAME="Mi ISP" SETUP_ADMIN_NAME="Ana" \
 *   SETUP_ADMIN_EMAIL="ana@miisp.com" SETUP_ADMIN_PASSWORD="..." npm run setup
 *
 * También lee esas variables del archivo .env. Si el correo ya existe, no hace nada.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta la variable ${name}`)
  return value
}

async function main() {
  const companyName = required('SETUP_COMPANY_NAME')
  const adminName = required('SETUP_ADMIN_NAME')
  const email = required('SETUP_ADMIN_EMAIL').toLowerCase()
  const password = required('SETUP_ADMIN_PASSWORD')

  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('SETUP_ADMIN_EMAIL no es un correo válido')
  if (password.length < 10) throw new Error('SETUP_ADMIN_PASSWORD debe tener al menos 10 caracteres')

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`El usuario ${email} ya existe. No se hizo ningún cambio.`)
    return
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: companyName,
      country: process.env.DEFAULT_COUNTRY || 'EC',
      currency: process.env.DEFAULT_CURRENCY || 'USD',
      timezone: process.env.DEFAULT_TIMEZONE || 'America/Guayaquil',
    },
  })

  await prisma.user.create({
    data: {
      email,
      name: adminName,
      role: 'ADMIN',
      password: await bcrypt.hash(password, 12),
      tenantId: tenant.id,
    },
  })

  console.log(`Empresa "${companyName}" y administrador ${email} creados.`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
