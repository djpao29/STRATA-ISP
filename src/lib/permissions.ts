import type { UserRole } from '@prisma/client'

/** Qué roles pueden usar cada módulo. ADMIN puede todo. */
export const MODULE_ROLES = {
  dashboard: ['ADMIN', 'MANAGER', 'TECHNICIAN', 'BILLING'],
  customers: ['ADMIN', 'MANAGER', 'TECHNICIAN', 'BILLING'],
  customersWrite: ['ADMIN', 'MANAGER', 'BILLING'],
  plans: ['ADMIN', 'MANAGER'],
  billing: ['ADMIN', 'MANAGER', 'BILLING'],
  payments: ['ADMIN', 'MANAGER', 'BILLING'],
  network: ['ADMIN', 'MANAGER', 'TECHNICIAN'],
  routers: ['ADMIN', 'MANAGER', 'TECHNICIAN'],
  olt: ['ADMIN', 'MANAGER', 'TECHNICIAN'],
  support: ['ADMIN', 'MANAGER', 'TECHNICIAN', 'BILLING'],
  whatsapp: ['ADMIN', 'MANAGER'],
  reports: ['ADMIN', 'MANAGER', 'BILLING'],
  settings: ['ADMIN'],
} satisfies Record<string, UserRole[]>

export type Module = keyof typeof MODULE_ROLES

export function can(role: UserRole, module: Module) {
  return (MODULE_ROLES[module] as UserRole[]).includes(role)
}

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  TECHNICIAN: 'Técnico',
  BILLING: 'Facturación',
}
