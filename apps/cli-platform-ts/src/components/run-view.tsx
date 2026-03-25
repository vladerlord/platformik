import { Box } from 'ink'
import type { BffClient } from '../api/client'
import { useRun } from '../hooks/use-run'
import { Message } from './message'
import { OptionInput } from './option-input'
import { StatusBar } from './status-bar'

type Props = {
  client: BffClient
  runId: string
}

export function RunView({ client, runId }: Props) {
  const { messages, status, pendingInput, submitAnswer } = useRun(client, runId)

  return (
    <Box flexDirection="column">
      <StatusBar status={status} runId={runId} />
      {messages.map((message, index) => (
        <Message key={message.id?.value ?? index} message={message} />
      ))}
      {pendingInput && <OptionInput input={pendingInput} onSubmit={submitAnswer} />}
    </Box>
  )
}
