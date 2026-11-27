import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import './globals.css'
import './dark.css'
import '@/components/icons/icons.css'
import { Providers } from '@/components/providers'

// La fuente sale de la pila definida en tailwind.config.js (Roboto si está instalada, si no la del sistema).
// No se usa next/font/google para no depender de internet al compilar.

export const metadata: Metadata = {
  title: 'WISPX Clone - Sistema de Gestión ISP',
  description:
    'Software ISP todo en uno en la nube: facturación, MikroTik, WhatsApp, portal del cliente, OLT y soporte',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Tema de todo el sistema (claro u oscuro), guardado en este navegador; se pinta desde el servidor para que no parpadee.
  const dark = cookies().get('theme')?.value === 'dark'
  return (
    <html lang="es" className={dark ? 'dark' : undefined} data-theme={dark ? 'dark' : 'light'}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
