import type { IamModule } from '@platformik/module-iam/contracts'
import { err, ok } from 'neverthrow'
import { vi } from 'vitest'
import type { WorkflowsService } from '../../application/workflows/workflows-service'
import type { WorkflowRunNotifier } from '../../features/workflows/workflow-run-notifier.types'
import type { EventBusListener } from '../event-bus/event-bus.types'
import { createTestSession } from './iam'

export const createMockWorkflowsIam = (): IamModule => ({
  auth: {
    signUp: async () => err({ type: 'unexpected_error', cause: new Error('not-implemented') }),
    signIn: async () => err({ type: 'unexpected_error', cause: new Error('not-implemented') }),
    signOut: async () => err({ type: 'unexpected_error', cause: new Error('not-implemented') }),
    getSession: async () =>
      ok({
        headers: new Headers(),
        payload: createTestSession(),
        status: 200,
      }),
  },
})

export const createMockEventBusListener = (): EventBusListener => ({
  isReady: () => true,
  subscribe: () => () => undefined,
  onStateChange: () => () => undefined,
  close: async () => undefined,
})

export const createMockWorkflowRunNotifier = (): WorkflowRunNotifier => ({
  isReady: () => true,
  getRunVersion: () => 0,
  waitForRunTrigger: async () => null,
  close: async () => undefined,
})

export type WorkflowsServiceMocks = {
  service: WorkflowsService
  listWorkflows: ReturnType<typeof vi.fn>
  startWorkflow: ReturnType<typeof vi.fn>
  getWorkflowRunView: ReturnType<typeof vi.fn>
  submitAnswer: ReturnType<typeof vi.fn>
}

export const createWorkflowsServiceMocks = (): WorkflowsServiceMocks => {
  const notImplemented = new Error('not-implemented')
  const listWorkflows = vi.fn().mockRejectedValue(notImplemented)
  const startWorkflow = vi.fn().mockRejectedValue(notImplemented)
  const getWorkflowRunView = vi.fn().mockRejectedValue(notImplemented)
  const submitAnswer = vi.fn().mockRejectedValue(notImplemented)

  return {
    service: {
      listWorkflows,
      startWorkflow,
      getWorkflowRunView,
      submitAnswer,
    } as unknown as WorkflowsService,
    listWorkflows,
    startWorkflow,
    getWorkflowRunView,
    submitAnswer,
  }
}

export const resetWorkflowsServiceMocks = (mocks: WorkflowsServiceMocks): void => {
  const notImplemented = new Error('not-implemented')
  mocks.listWorkflows.mockReset().mockRejectedValue(notImplemented)
  mocks.startWorkflow.mockReset().mockRejectedValue(notImplemented)
  mocks.getWorkflowRunView.mockReset().mockRejectedValue(notImplemented)
  mocks.submitAnswer.mockReset().mockRejectedValue(notImplemented)
}
