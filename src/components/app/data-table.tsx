import { Inbox } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Tabla simple dentro de una tarjeta, con estado vacío. */
export function DataTable({
  title,
  headers,
  emptyText = 'No hay registros todavía.',
  rowCount,
  children,
}: {
  title?: string
  headers: string[]
  emptyText?: string
  rowCount: number
  children: React.ReactNode
}) {
  return (
    <Card>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? '' : 'pt-6'}>
        {rowCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Inbox className="h-8 w-8" />
            <p className="text-sm">{emptyText}</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">{children}</tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
