import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { createUser, resetUserPassword, updateCompany, updateUserAccess } from './actions'
import { CompanyForm, NewUserForm, ResetPasswordForm, RoleSelectForm } from './forms'

export const metadata = { title: 'Configuración' }

export default async function SettingsPage() {
  const me = await requireUser('settings')
  const [tenant, users, logs] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: me.tenantId } }),
    prisma.user.findMany({
      where: { tenantId: me.tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
    }),
    prisma.auditLog.findMany({
      where: { tenantId: me.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { name: true } } },
    }),
  ])

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" description="Empresa, usuarios y registro de actividad" />

      <Card>
        <CardHeader>
          <CardTitle>Empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <CompanyForm action={updateCompany} tenant={tenant} />
        </CardContent>
      </Card>

      <DataTable title="Usuarios" headers={['Nombre', 'Correo', 'Rol', 'Último acceso', 'Estado', 'Contraseña', '']} rowCount={users.length}>
        {users.map((u) => {
          const self = u.id === me.id
          return (
            <tr key={u.id}>
              <td className="font-medium">
                {u.name}
                {self && <span className="ml-1 text-xs text-muted-foreground">(tú)</span>}
              </td>
              <td>{u.email}</td>
              <td>{self ? 'Administrador' : <RoleSelectForm action={updateUserAccess} id={u.id} role={u.role} />}</td>
              <td>{formatDateTime(u.lastLoginAt)}</td>
              <td>
                <StatusBadge value={u.isActive ? 'ACTIVE' : 'INACTIVE'} />
              </td>
              <td>{!self && <ResetPasswordForm action={resetUserPassword} id={u.id} />}</td>
              <td className="text-right">
                {!self && (
                  <ActionButton
                    action={updateUserAccess}
                    fields={{ id: u.id, isActive: String(!u.isActive) }}
                    variant="outline"
                    size="sm"
                    confirm={u.isActive ? `¿Desactivar a ${u.name}? No podrá iniciar sesión.` : undefined}
                  >
                    {u.isActive ? 'Desactivar' : 'Activar'}
                  </ActionButton>
                )}
              </td>
            </tr>
          )
        })}
      </DataTable>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <NewUserForm action={createUser} />
        </CardContent>
      </Card>

      <DataTable title="Actividad reciente" headers={['Fecha', 'Usuario', 'Acción', 'Entidad']} rowCount={logs.length} emptyText="Sin actividad registrada.">
        {logs.map((l) => (
          <tr key={l.id}>
            <td>{formatDateTime(l.createdAt)}</td>
            <td>{l.user?.name ?? '—'}</td>
            <td className="font-mono text-xs">{l.action}</td>
            <td className="text-xs text-muted-foreground">
              {l.entity}
              {l.entityId && ` · ${l.entityId}`}
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  )
}
