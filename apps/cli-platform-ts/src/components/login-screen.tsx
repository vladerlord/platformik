import { useEffect } from 'react'
import { Text } from 'ink'
import Spinner from 'ink-spinner'
import { useAuth } from '../context/auth-context'

type Props = {
  email: string
  password: string
  onSuccess: () => void
}

export function LoginScreen({ email, password, onSuccess }: Props) {
  const { state, login } = useAuth()

  useEffect(() => {
    void login(email, password).then((success) => {
      if (success) onSuccess()
    })
  }, [email, password, login, onSuccess])

  if (state.status === 'logging_in') {
    return (
      <Text>
        <Spinner type="dots" /> Logging in...
      </Text>
    )
  }

  if (state.status === 'error') {
    return <Text color="red">Login failed: {state.message}</Text>
  }

  return null
}
