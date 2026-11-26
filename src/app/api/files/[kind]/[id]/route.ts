import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiUser } from '@/lib/monitoring/api-auth'

export const dynamic = 'force-dynamic'

/**
 * Descarga de comprobantes guardados en la base de datos.
 * /api/files/payment/<id>  y  /api/files/expense/<id>   (?download=1 para descargar)
 * Solo para usuarios con permiso y de la misma empresa.
 */
export async function GET(req: Request, { params }: { params: { kind: string; id: string } }) {
  let file: { receiptData: Buffer | null; receiptMime: string | null; receiptName: string | null } | null = null

  if (params.kind === 'payment') {
    const { user, error } = await apiUser('payments')
    if (error) return error
    file = await prisma.payment.findFirst({
      where: { id: params.id, tenantId: user.tenantId },
      select: { receiptData: true, receiptMime: true, receiptName: true },
    })
  } else if (params.kind === 'expense') {
    const { user, error } = await apiUser('expenses')
    if (error) return error
    file = await prisma.expense.findFirst({
      where: { id: params.id, tenantId: user.tenantId },
      select: { receiptData: true, receiptMime: true, receiptName: true },
    })
  } else {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  if (!file?.receiptData || !file.receiptMime) return NextResponse.json({ error: 'Sin comprobante' }, { status: 404 })

  const download = new URL(req.url).searchParams.has('download')
  const name = (file.receiptName ?? 'comprobante').replace(/["\r\n]/g, '')
  return new NextResponse(new Uint8Array(file.receiptData), {
    headers: {
      'Content-Type': file.receiptMime,
      'Content-Length': String(file.receiptData.length),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name}"`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      // Un PDF o imagen nunca debe ejecutar scripts en el dominio de la app.
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  })
}
