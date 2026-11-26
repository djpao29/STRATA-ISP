import type { UserRole } from '@prisma/client'
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface User {
    role: UserRole
    tenantId: string
  }

  interface Session {
    user: {
      id: string
      role: UserRole
      tenantId: string
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: UserRole
    tenantId: string
  }
}
