import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { BffClient } from '../api/client'

type AuthState =
  | { status: 'logged_out' }
  | { status: 'logging_in' }
  | { status: 'logged_in' }
  | { status: 'error'; message: string }

type AuthContextValue = {
  state: AuthState
  login: (email: string, password: string) => Promise<boolean>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ client, children }: { client: BffClient; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'logged_out' })

  const login = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setState({ status: 'logging_in' })

      try {
        const response = await client.login(email, password)
        client.setToken(response.sessionToken)
        setState({ status: 'logged_in' })

        return true
      } catch (error) {
        setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })

        return false
      }
    },
    [client],
  )

  return <AuthContext.Provider value={{ state, login }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
