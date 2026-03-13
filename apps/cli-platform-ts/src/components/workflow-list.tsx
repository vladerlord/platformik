import { useEffect } from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import type { BffClient } from '../api/client'
import { useWorkflows } from '../hooks/use-workflows'

type Props = {
  client: BffClient
}

export function WorkflowList({ client }: Props) {
  const { state, load } = useWorkflows(client)

  useEffect(() => {
    void load()
  }, [load])

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <Text>
        <Spinner type="dots" /> Loading workflows...
      </Text>
    )
  }

  if (state.status === 'error') {
    return <Text color="red">Error: {state.message}</Text>
  }

  if (state.workflows.length === 0) {
    return <Text>No workflows available.</Text>
  }

  return (
    <Box flexDirection="column">
      <Text bold>Available workflows:</Text>
      {state.workflows.map((workflow) => {
        const id = workflow.id?.value ?? '(unknown)'

        return (
          <Text key={id}>
            {'  '}
            {id} {workflow.title}
          </Text>
        )
      })}
    </Box>
  )
}
