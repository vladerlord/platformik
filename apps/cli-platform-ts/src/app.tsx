import { useState, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import type { BffClient } from './api/client'
import { AuthProvider } from './context/auth-context'
import { LoginScreen } from './components/login-screen'
import { WorkflowList } from './components/workflow-list'
import { RunView } from './components/run-view'

type Screen = { type: 'login' } | { type: 'repl' } | { type: 'workflows' } | { type: 'run'; runId: string }

type Props = {
  client: BffClient
  email: string
  password: string
}

function AppContent({ client, email, password }: Props) {
  const [screen, setScreen] = useState<Screen>({ type: 'login' })
  const [input, setInput] = useState('')

  const handleLoginSuccess = useCallback(() => {
    setScreen({ type: 'repl' })
  }, [])

  const handleCommand = useCallback(
    async (command: string) => {
      const parts = command.trim().split(/\s+/)
      const cmd = parts[0]

      switch (cmd) {
        case '/workflows':
          setScreen({ type: 'workflows' })
          break

        case '/start': {
          const workflowId = parts[1]
          if (!workflowId) {
            return
          }

          try {
            const response = await client.startWorkflow(workflowId)
            setScreen({ type: 'run', runId: response.workflowRunId })
          } catch (error) {
            console.error(error instanceof Error ? error.message : String(error))
          }
          break
        }

        case '/attach': {
          const runId = parts[1]
          if (!runId) {
            return
          }
          setScreen({ type: 'run', runId })
          break
        }
      }
    },
    [client],
  )

  const handleSubmit = useCallback(
    (value: string) => {
      setInput('')
      if (value.trim()) {
        void handleCommand(value)
      }
    },
    [handleCommand],
  )

  useInput((_input, key) => {
    if (key.escape && screen.type !== 'login') {
      setScreen({ type: 'repl' })
    }
  })

  if (screen.type === 'login') {
    return <LoginScreen email={email} password={password} onSuccess={handleLoginSuccess} />
  }

  return (
    <Box flexDirection="column">
      {screen.type === 'workflows' && <WorkflowList client={client} />}
      {screen.type === 'run' && <RunView client={client} runId={screen.runId} />}
      {screen.type === 'repl' && (
        <Text>
          Commands: /workflows, /start {'<id>'}, /attach {'<run-id>'}. Press Ctrl+C to exit.
        </Text>
      )}
      <Box>
        <Text bold>{'> '}</Text>
        <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
      </Box>
    </Box>
  )
}

export function App({ client, email, password }: Props) {
  return (
    <AuthProvider client={client}>
      <AppContent client={client} email={email} password={password} />
    </AuthProvider>
  )
}
