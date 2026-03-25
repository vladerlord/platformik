import { useState, useCallback } from 'react'
import type { BffClient, WorkflowSummary } from '../api/client'

type WorkflowsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; workflows: WorkflowSummary[] }
  | { status: 'error'; message: string }

export function useWorkflows(client: BffClient) {
  const [state, setState] = useState<WorkflowsState>({ status: 'idle' })

  const load = useCallback(async () => {
    setState({ status: 'loading' })

    try {
      const response = await client.listWorkflows()
      setState({ status: 'loaded', workflows: response.workflows })
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }, [client])

  return { state, load }
}
