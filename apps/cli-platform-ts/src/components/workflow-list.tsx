import { useEffect } from 'react'
import { Box, Text } from 'ink'
import { useWorkflows } from '../hooks/use-workflows'
import { useUIState } from '../ui/contexts/UIStateContext'
import { SectionHeader } from '../ui/components/shared/SectionHeader'
import { StatusLine } from '../ui/components/shared/StatusLine'
import { semanticColors } from '../ui/semantic-colors'

export function WorkflowList() {
  const uiState = useUIState()
  const { state, load } = useWorkflows(uiState.client)

  useEffect(() => {
    void load()
  }, [load])

  if (state.status === 'idle' || state.status === 'loading') {
    return <StatusLine text="Loading workflows..." variant="info" spinner />
  }

  if (state.status === 'error') {
    return <Text color={semanticColors.status.error}>{`Error: ${state.message}`}</Text>
  }

  if (state.workflows.length === 0) {
    return <Text color={semanticColors.text.primary}>No workflows available.</Text>
  }

  return (
    <Box flexDirection="column">
      <SectionHeader title="Available workflows" />
      {state.workflows.map((workflow) => {
        const id = workflow.id?.value ?? '(unknown)'

        return (
          <Text key={id} color={semanticColors.text.primary}>
            {'  '}
            {id} {workflow.title}
          </Text>
        )
      })}
    </Box>
  )
}
