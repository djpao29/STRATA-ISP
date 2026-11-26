import type {
  ClientMode,
  CustomerStatus,
  InvoiceStatus,
  PaymentMethod,
  Priority,
  RouterType,
  TicketStatus,
} from '@prisma/client'

const options = <T extends string>(labels: Record<T, string>) =>
  (Object.entries(labels) as Array<[T, string]>).map(([value, label]) => ({ value, label }))

export const CUSTOMER_STATUS: Record<CustomerStatus, string> = {
  PENDING: 'Pendiente de instalación',
  ACTIVE: 'Activo',
  SUSPENDED: 'Suspendido',
  CANCELLED: 'Cancelado',
}

export const INVOICE_STATUS: Record<InvoiceStatus, string> = {
  PENDING: 'Pendiente',
  OVERDUE: 'Vencida',
  PAID: 'Pagada',
  CANCELLED: 'Anulada',
}

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  DEPOSIT: 'Depósito',
  CARD: 'Tarjeta',
  OTHER: 'Otro',
}

export const CLIENT_MODE: Record<ClientMode, string> = {
  PPPoE: 'PPPoE',
  DHCP: 'DHCP',
  STATIC_IP: 'IP estática',
}

export const ROUTER_TYPE: Record<RouterType, string> = {
  MIKROTIK: 'MikroTik',
  CISCO: 'Cisco',
  JUNIPER: 'Juniper',
  GENERIC: 'Genérico',
}

export const TICKET_STATUS: Record<TicketStatus, string> = {
  OPEN: 'Abierto',
  IN_PROGRESS: 'En progreso',
  RESOLVED: 'Resuelto',
  CLOSED: 'Cerrado',
}

export const PRIORITY: Record<Priority, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  URGENT: 'Urgente',
}

export const customerStatusOptions = options(CUSTOMER_STATUS)
export const invoiceStatusOptions = options(INVOICE_STATUS)
export const paymentMethodOptions = options(PAYMENT_METHOD)
export const clientModeOptions = options(CLIENT_MODE)
export const routerTypeOptions = options(ROUTER_TYPE)
export const ticketStatusOptions = options(TICKET_STATUS)
export const priorityOptions = options(PRIORITY)
