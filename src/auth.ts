import type { NextAuthOptions } from 'next-auth'
import { getServerSession } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import { prisma } from '@/lib/prisma'

// Máximo 5 intentos fallidos por correo cada 15 minutos.
// Es en memoria: con varias instancias de la app, usar un store compartido (Redis).
const loginLimiter = new RateLimiterMemory({ points: 5, duration: 15 * 60 })

// Hash válido de una contraseña aleatoria: se compara aunque el usuario no exista
// para que el tiempo de respuesta no revele qué correos están registrados.
const DUMMY_HASH = '$2a$12$p/S.iFpoWOIB1pIpcpMdXeN0a5ucOxFvpCuKJYI68mYN07lqsvm4u'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase()
        const password = credentials?.password
        if (!email || !password) return null

        const limit = await loginLimiter.get(email)
        if (limit && limit.consumedPoints >= 5) {
          throw new Error('Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.')
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: { tenant: { select: { isActive: true } } },
        })

        const isValid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH)
        if (!user || !isValid || !user.isActive || !user.tenant.isActive) {
          await loginLimiter.consume(email).catch(() => undefined)
          return null
        }

        await loginLimiter.delete(email)
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

        return { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId }
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: '/auth/login' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.tenantId = user.tenantId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
        session.user.tenantId = token.tenantId
      }
      return session
    },
  },
}

/** Devuelve la sesión actual en Server Components y route handlers. */
export function auth() {
  return getServerSession(authOptions)
}
