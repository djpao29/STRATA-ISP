import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { createUser, resetUserPassword, updateUserAccess } from '../actions'
import { NewUserForm, ResetPasswordForm, RoleSelectForm } from '../forms'
import { BackToSettings } from '../settings-ui'

export const metadata = { title: 'Gestión de personal' }

export default async function UsersSettingsPage() {
  const me = await requireUser('settings')
  const users = await prisma.user.findMany({
    where: { tenantId: me.tenantId },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
  })
  return (
    <div className="space-y-6">
      <BackToSettings />
      <PageHeader title="Gestión de personal" description="Usuarios del sistema, sus roles y accesos" />

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
    </div>
  )
}
