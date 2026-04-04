import { useCallback, useEffect, useMemo, useState } from 'react'
import { useInput } from 'ink'
import type { BffClient } from '../api/client'
import type { UIActions, UIState } from './types'
import { UIActionsProvider } from './contexts/UIActionsContext'
import { UIStateProvider } from './contexts/UIStateContext'
import { App } from './App'

type Props = {
  client: BffClient
  email: string
  password: string
}

export function AppContainer({ client, email, password }: Props) {
  const [screen, setScreen] = useState<UIState['screen']>({ type: 'login' })
  const [hasRunPendingInput, setHasRunPendingInput] = useState(false)

  const openWorkflows = useCallback(() => {
    setScreen({ type: 'workflows' })
  }, [])

  const navigateToRepl = useCallback(() => {
    setScreen({ type: 'repl' })
  }, [])

  const attachToRun = useCallback((runId: string) => {
    setScreen({ type: 'run', runId })
  }, [])

  const startWorkflow = useCallback(
    async (workflowId: string) => {
      try {
        const response = await client.startWorkflow(workflowId)
        setScreen({ type: 'run', runId: response.workflowRunId })
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
      }
    },
    [client],
  )

  const submitAnswer = useCallback(
    async (optionId: string) => {
      if (screen.type !== 'run') {
        return
      }

      await client.submitAnswer(screen.runId, optionId)
    },
    [client, screen],
  )

  const submitCommand = useCallback(
    (command: string) => {
      const parts = command.trim().split(/\s+/)
      const cmd = parts[0]

      switch (cmd) {
        case '/workflows':
          openWorkflows()
          break
        case '/start': {
          const workflowId = parts[1]
          if (!workflowId) {
            return
          }
          void startWorkflow(workflowId)
          break
        }
        case '/attach': {
          const runId = parts[1]
          if (!runId) {
            return
          }
          attachToRun(runId)
          break
        }
      }
    },
    [attachToRun, openWorkflows, startWorkflow],
  )

  useInput((_input, key) => {
    if (key.escape && screen.type !== 'login') {
      navigateToRepl()
    }
  })

  useEffect(() => {
    if (screen.type !== 'run') {
      setHasRunPendingInput(false)
    }
  }, [screen.type])

  const state = useMemo<UIState>(
    () => ({
      client,
      email,
      password,
      screen,
      hasRunPendingInput,
      currentRunId: screen.type === 'run' ? screen.runId : null,
    }),
    [client, email, password, screen, hasRunPendingInput],
  )

  const actions = useMemo<UIActions>(
    () => ({
      onLoginSuccess: navigateToRepl,
      navigateToRepl,
      openWorkflows,
      startWorkflow,
      attachToRun,
      submitAnswer,
      submitCommand,
      setRunPendingInput: setHasRunPendingInput,
    }),
    [attachToRun, navigateToRepl, openWorkflows, startWorkflow, submitAnswer, submitCommand],
  )

  return (
    <UIStateProvider value={state}>
      <UIActionsProvider value={actions}>
        <App />
      </UIActionsProvider>
    </UIStateProvider>
  )
}
