import type { BffClient } from './api/client'
import { AuthProvider } from './context/auth-context'
import { AppContainer } from './ui/AppContainer'

type Props = {
  client: BffClient
  email: string
  password: string
}

export function App({ client, email, password }: Props) {
  return (
    <AuthProvider client={client}>
      <AppContainer client={client} email={email} password={password} />
    </AuthProvider>
  )
}
