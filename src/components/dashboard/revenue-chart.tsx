'use client'

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { currencyLocale } from '@/lib/format'

export type MonthlyPoint = { month: string; facturado: number; cobrado: number }

export function RevenueChart({ data, currency }: { data: MonthlyPoint[]; currency: string }) {
  const fmt = (v: number) => new Intl.NumberFormat(currencyLocale(currency), { style: 'currency', currency, maximumFractionDigits: 0 }).format(v)
  const empty = data.every((d) => d.facturado === 0 && d.cobrado === 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Facturado vs. cobrado (últimos 12 meses)</CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Aún no hay facturas ni pagos para mostrar.</p>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis width={72} tickLine={false} axisLine={false} fontSize={12} tickFormatter={fmt} />
                <Tooltip formatter={(value: number, name: string) => [fmt(value), name === 'facturado' ? 'Facturado' : 'Cobrado']} />
                <Bar dataKey="facturado" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cobrado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
