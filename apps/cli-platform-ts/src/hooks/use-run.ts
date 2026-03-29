import { useState, useEffect, useCallback, useRef } from 'react'
import type { BffClient, ConversationMessage, PendingInput } from '../api/client'

type RunStatus = 'connecting' | 'active' | 'completed' | 'failed' | 'error'

type RunState = {
  messages: ConversationMessage[]
  status: RunStatus
  pendingInput: PendingInput | null
  error: string | null
}

function mapApiStatusToRunStatus(status: string): RunStatus | null {
  if (status === 'WORKFLOW_RUN_STATUS_COMPLETED' || status === 'completed') {
    return 'completed'
  }
  if (status === 'WORKFLOW_RUN_STATUS_FAILED' || status === 'failed') {
    return 'failed'
  }
  if (status === 'WORKFLOW_RUN_STATUS_RUNNING' || status === 'running') {
    return 'active'
  }

  return null
}

export function useRun(client: BffClient, runId: string) {
  const [state, setState] = useState<RunState>({
    messages: [],
    status: 'connecting',
    pendingInput: null,
    error: null,
  })
  const subscriptionRef = useRef<{ close: () => void } | null>(null)
  const seenMessageIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const subscription = client.subscribeToRun(
      runId,
      undefined,
      (event) => {
        switch (event.event) {
          case 'message': {
            const message = JSON.parse(event.data) as ConversationMessage
            const messageId = message.id?.value
            if (messageId && seenMessageIdsRef.current.has(messageId)) {
              break
            }
            if (messageId) {
              seenMessageIdsRef.current.add(messageId)
            }
            setState((prev) => ({
              ...prev,
              status: prev.status === 'connecting' ? 'active' : prev.status,
              messages: [...prev.messages, message],
            }))
            break
          }

          case 'status': {
            const data = JSON.parse(event.data) as {
              status: string
              revision: number
              currentNodeId: string | null
            }

            const newStatus = mapApiStatusToRunStatus(data.status)

            setState((prev) => ({ ...prev, status: newStatus ?? prev.status }))

            if (newStatus === 'completed' || newStatus === 'failed') {
              subscriptionRef.current?.close()
            }
            break
          }

          case 'pending_input': {
            const parsed = JSON.parse(event.data) as PendingInput | null
            setState((prev) => ({
              ...prev,
              pendingInput: parsed,
              status: parsed ? 'active' : prev.status,
            }))
            break
          }

          case 'heartbeat':
            setState((prev) => ({
              ...prev,
              status: prev.status === 'connecting' ? 'active' : prev.status,
            }))
            break

          case 'error': {
            const errorData = JSON.parse(event.data) as { message: string }
            setState((prev) => ({ ...prev, error: errorData.message }))
            break
          }
        }
      },
      (error) => {
        setState((prev) => ({ ...prev, status: 'error', error: error.message }))
      },
    )

    subscriptionRef.current = subscription

    return () => {
      subscription.close()
    }
  }, [client, runId])

  const submitAnswer = useCallback(
    async (optionId: string) => {
      setState((prev) => ({ ...prev, pendingInput: null }))
      await client.submitAnswer(runId, optionId)
    },
    [client, runId],
  )

  return { ...state, submitAnswer }
}
