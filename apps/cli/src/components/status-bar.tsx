import { Box } from 'ink'
import { StatusLine } from '../ui/components/shared/StatusLine'

type Props = {
  status: 'connecting' | 'active' | 'completed' | 'failed' | 'error'
  runId?: string
}

export function StatusBar({ status, runId }: Props) {
  return (
    <Box>
      {status === 'connecting' ? (
        <StatusLine text={`Connecting to run ${runId}...`} variant="warning" spinner />
      ) : null}
      {status === 'active' ? <StatusLine text={`Run ${runId} active`} variant="success" spinner /> : null}
      {status === 'completed' ? <StatusLine text="Run completed" variant="success" /> : null}
      {status === 'failed' ? <StatusLine text="Run failed" variant="error" /> : null}
      {status === 'error' ? <StatusLine text="Connection error" variant="error" /> : null}
    </Box>
  )
}
