import { useEffect } from 'react'
import { Text } from 'ink'
import { useAuth } from '../context/auth-context'
import { useUIState } from '../ui/contexts/UIStateContext'
import { useUIActions } from '../ui/contexts/UIActionsContext'
import { StatusLine } from '../ui/components/shared/StatusLine'
import { semanticColors } from '../ui/semantic-colors'

export function LoginScreen() {
  const { state, login } = useAuth()
  const uiState = useUIState()
  const uiActions = useUIActions()

  useEffect(() => {
    void login(uiState.email, uiState.password).then((success) => {
      if (success) {
        uiActions.onLoginSuccess()
      }
    })
  }, [login, uiActions, uiState.email, uiState.password])

  if (state.status === 'logging_in') {
    return <StatusLine text="Logging in..." variant="info" spinner />
  }

  if (state.status === 'error') {
    return <Text color={semanticColors.status.error}>{`Login failed: ${state.message}`}</Text>
  }

  return null
}
