import type { ProformaStatus } from '@prisma/client'

export const PROFORMA_STATUS: Record<ProformaStatus, [string, string]> = {
  DRAFT: ['Borrador', 'bg-gray-100 text-gray-700'],
  SENT: ['Enviada', 'bg-blue-100 text-blue-800'],
  ACCEPTED: ['Aceptada', 'bg-green-100 text-green-800'],
  REJECTED: ['Rechazada', 'bg-red-100 text-red-800'],
  INVOICED: ['Facturada', 'bg-purple-100 text-purple-800'],
}
