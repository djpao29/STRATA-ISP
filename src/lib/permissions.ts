import type { UserRole } from '@prisma/client'

/** Qué roles pueden usar cada módulo. ADMIN puede todo. */
export const MODULE_ROLES = {
  dashboard: ['ADMIN', 'MANAGER', 'TECHNICIAN', 'BILLING'],
  customers: ['ADMIN', 'MANAGER', 'TECHNICIAN', 'BILLING'],
  customersWrite: ['ADMIN', 'MANAGER', 'BILLING'],
  notifications: ['ADMIN', 'MANAGER', 'BILLING'],
  installations: ['ADMIN', 'MANAGER', 'TECHNICIAN', 'BILLING'],
  devices: ['ADMIN', 'MANAGER', 'TECHNICIAN'],
  notices: ['ADMIN', 'MANAGER'],
  plans: ['ADMIN', 'MANAGER'],
  billing: ['ADMIN', 'MANAGER', 'BILLING'],
  zones: ['ADMIN', 'MANAGER', 'BILLING'],
  finance: ['ADMIN', 'MANAGER', 'BILLING'],
  expenses: ['ADMIN', 'MANAGER', 'BILLING'],
  accounting: ['ADMIN', 'MANAGER'],
  paymentAccounts: ['ADMIN', 'MANAGER'],
  zonesWrite: ['ADMIN', 'MANAGER'],
  payments: ['ADMIN', 'MANAGER', 'BILLING'],
  network: ['ADMIN', 'MANAGER', 'TECHNICIAN'],
  routers: ['ADMIN', 'MANAGER', 'TECHNICIAN'],
  monitoring: ['ADMIN', 'MANAGER', 'TECHNICIAN'],
  monitoringSettings: ['ADMIN', 'MANAGER'],
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
