import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'

type Props = {
  status: 'connecting' | 'active' | 'completed' | 'failed' | 'error'
  runId?: string
}

export function StatusBar({ status, runId }: Props) {
  return (
    <Box>
      {status === 'connecting' && (
        <Text color="yellow">
          <Spinner type="dots" /> Connecting to run {runId}...
        </Text>
      )}
      {status === 'active' && (
        <Text color="green">
          <Spinner type="dots" /> Run {runId} active
        </Text>
      )}
      {status === 'completed' && <Text color="green">Run completed</Text>}
      {status === 'failed' && <Text color="red">Run failed</Text>}
      {status === 'error' && <Text color="red">Connection error</Text>}
    </Box>
  )
}
