import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/providers'

// La fuente sale de la pila definida en tailwind.config.js (Roboto si está instalada, si no la del sistema).
// No se usa next/font/google para no depender de internet al compilar.

export const metadata: Metadata = {
  title: 'WISPX Clone - Sistema de Gestión ISP',
  description:
    'Software ISP todo en uno en la nube: facturación, MikroTik, WhatsApp, portal del cliente, OLT y soporte',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="light">
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
