import type { CampaignStatus, RecipientStatus } from '@prisma/client'

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, [string, string]> = {
  SENDING: ['Enviando', 'bg-blue-100 text-blue-800'],
  DONE: ['Terminada', 'bg-green-100 text-green-800'],
  CANCELLED: ['Cancelada', 'bg-gray-100 text-gray-700'],
}

export const RECIPIENT_STATUS_LABEL: Record<RecipientStatus, [string, string]> = {
  PENDING: ['En cola', 'bg-blue-100 text-blue-800'],
  SENT: ['Enviado', 'bg-green-100 text-green-800'],
  FAILED: ['Falló', 'bg-red-100 text-red-800'],
  SKIPPED: ['Omitido', 'bg-gray-100 text-gray-700'],
}
