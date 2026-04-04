import { useEffect } from 'react'
import { Box } from 'ink'
import { useRun } from '../hooks/use-run'
import { Message } from './message'
import { OptionInput } from './option-input'
import { StatusBar } from './status-bar'
import { useUIActions } from '../ui/contexts/UIActionsContext'
import { useUIState } from '../ui/contexts/UIStateContext'

export function RunView() {
  const uiState = useUIState()
  const uiActions = useUIActions()
  const runId = uiState.currentRunId ?? ''

  const { messages, status, pendingInput, submitAnswer } = useRun(uiState.client, runId)
  const hasPendingInput = Boolean(pendingInput)

  useEffect(() => {
    uiActions.setRunPendingInput(hasPendingInput)
  }, [hasPendingInput, uiActions])

  return (
    <Box flexDirection="column">
      <StatusBar status={status} runId={runId} />
      {messages.map((message, index) => (
        <Message key={message.id?.value ?? index} message={message} />
      ))}
      {pendingInput ? <OptionInput input={pendingInput} onSubmit={submitAnswer} /> : null}
    </Box>
  )
}
