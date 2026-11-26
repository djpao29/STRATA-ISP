import { withAuth } from 'next-auth/middleware'

// Exige sesión para todo el panel; el layout del dashboard vuelve a comprobarla en el servidor.
export default withAuth({
  pages: { signIn: '/auth/login' },
})

export const config = {
  matcher: ['/dashboard/:path*'],
}
