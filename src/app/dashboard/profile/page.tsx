import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { requireUser } from '@/lib/session'
import { ROLE_LABELS } from '@/lib/permissions'
import { changeOwnPassword } from './actions'
import { ChangePasswordForm } from './form'

export const metadata = { title: 'Mi perfil' }

export default async function ProfilePage() {
  const user = await requireUser()
  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title="Mi perfil" />
      <Card>
        <CardContent className="space-y-1 pt-6 text-sm">
          <div className="font-medium">{user.name}</div>
          <div>{user.email}</div>
          <div className="text-muted-foreground">
            {ROLE_LABELS[user.role]} · {user.tenant.name}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm action={changeOwnPassword} />
        </CardContent>
      </Card>
    </div>
  )
}
