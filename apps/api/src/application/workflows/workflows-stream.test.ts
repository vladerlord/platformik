import { describe, expect, test, vi } from 'vitest'
import type { WorkflowRunNotifier } from '../../features/workflows/workflow-run-notifier.types'
import type { WorkflowsService } from './workflows-service'
import { mapRunViewToSseDeltas, streamWorkflowEvents } from './workflows-stream'

const createRunView = (overrides: Record<string, unknown> = {}) => ({
  conversationId: { value: 'conversation-1' },
  status: 'WORKFLOW_RUN_STATUS_RUNNING',
  currentNodeId: 'node-1',
  revision: 1,
  lastMessageId: { value: 'message-1' },
  messages: [
    {
      id: { value: 'message-1' },
      conversationId: { value: 'conversation-1' },
      runId: { value: 'run-1' },
      role: 1,
      content: { text: 'hello' },
    },
  ],
  pendingInput: { optionInput: { label: 'Choose', options: [] } },
  ...overrides,
})

describe('mapRunViewToSseDeltas', () => {
  test('emits pending_input clear when workflow becomes terminal', () => {
    const streamState = {
      lastRevision: 1,
      lastStatus: 'WORKFLOW_RUN_STATUS_RUNNING',
      lastPendingInputJson: JSON.stringify({ optionInput: { label: 'Choose', options: [] } }),
    }

    const delta = mapRunViewToSseDeltas(
      createRunView({
        status: 'WORKFLOW_RUN_STATUS_COMPLETED',
        revision: 2,
        messages: [],
        pendingInput: undefined,
      }),
      streamState,
    )

    expect(delta.terminal).toBe(true)
    expect(delta.events).toEqual([
      {
        event: 'status',
        data: {
          status: 'WORKFLOW_RUN_STATUS_COMPLETED',
          revision: 2,
          currentNodeId: 'node-1',
        },
      },
      { event: 'pending_input', data: null },
    ])
  })
})

describe('streamWorkflowEvents', () => {
  test('emits heartbeat when no updates are available', async () => {
    let connected = true

    const workflowsService = {
      getWorkflowRunView: async () =>
        createRunView({
          messages: [],
          pendingInput: undefined,
          lastMessageId: undefined,
        }),
    } as unknown as WorkflowsService

    const workflowRunNotifier = {
      isReady: () => true,
      getRunVersion: () => 0,
      waitForRunTrigger: vi
        .fn<WorkflowRunNotifier['waitForRunTrigger']>()
        .mockResolvedValueOnce(null)
        .mockImplementationOnce(async () => {
          connected = false

          return null
        }),
      close: async () => undefined,
    } as WorkflowRunNotifier

    const events: Array<{ event: string | undefined; data: unknown }> = []

    for await (const event of streamWorkflowEvents({
      runId: 'run-1',
      afterId: undefined,
      authContext: { userId: 'user-1' },
      workflowsService,
      workflowRunNotifier,
      heartbeatIntervalMs: 10,
      isConnected: () => connected,
    })) {
      events.push({ event: event.event, data: event.data })
    }

    expect(events).toEqual([
      {
        event: 'status',
        data: {
          status: 'WORKFLOW_RUN_STATUS_RUNNING',
          revision: 1,
          currentNodeId: 'node-1',
        },
      },
      { event: 'heartbeat', data: {} },
    ])
  })
})
