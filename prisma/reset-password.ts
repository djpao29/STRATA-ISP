/**
 * Cambia la contraseña de un usuario desde la terminal (por si se olvidó o quedó bloqueado).
 * La contraseña se escribe oculta y no queda en el historial.
 *
 *   npm run reset-password                 (pregunta el correo)
 *   npm run reset-password -- ana@miisp.com
 */
import 'dotenv/config'
import readline from 'readline'
import { Writable } from 'stream'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { passwordRule } from '../src/lib/validation'

const prisma = new PrismaClient()

// Un solo lector para todas las preguntas; "muted" oculta lo que se escribe.
let muted = false
const output = new Writable({
  write(chunk, _enc, cb) {
    if (!muted) process.stdout.write(chunk)
    cb()
  },
})
const rl = readline.createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY })
const lines = rl[Symbol.asyncIterator]()

/** Lee una línea; con hidden=true no muestra lo que se escribe. */
async function ask(question: string, hidden = false): Promise<string> {
  process.stdout.write(question)
  muted = hidden
  const { value, done } = await lines.next()
  muted = false
  if (hidden) process.stdout.write('\n')
  if (done) throw new Error('Entrada cancelada')
  return String(value).trim()
}

async function main() {
  const email = (process.argv[2] || (await ask('Correo del usuario: '))).toLowerCase()
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new Error(`No existe ningún usuario con el correo ${email}`)

  const password = await ask('Nueva contraseña (no se muestra): ', true)
  const check = passwordRule.safeParse(password)
  if (!check.success) throw new Error(check.error.issues[0].message)
  if ((await ask('Repite la contraseña: ', true)) !== password) throw new Error('Las contraseñas no coinciden')

  await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(password, 12), isActive: true },
  })
  await prisma.auditLog.create({
    data: { tenantId: user.tenantId, action: 'user.password_reset_cli', entity: 'User', entityId: user.id },
  })
  console.log(`Contraseña de ${email} cambiada. Si el login quedó bloqueado por intentos, reinicia el servidor.`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => {
    rl.close()
    return prisma.$disconnect()
  })
