import { workflowEventTopics } from '@platformik/contracts-event-bus'
import type { EventBusListener } from '../../ops/event-bus/event-bus.types'
import type { RunWaiter, WorkflowRunNotifier } from './workflow-run-notifier.types'

export class WorkflowRunNotifierUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowRunNotifierUnavailableError'
  }
}

export function createWorkflowRunNotifier(options: {
  eventBusListener: EventBusListener
}): WorkflowRunNotifier {
  const { eventBusListener } = options

  let currentError: Error = new WorkflowRunNotifierUnavailableError('Workflow run notifier is unavailable')
  const runVersionByRunId = new Map<string, number>()
  const waitersByRunId = new Map<string, Set<RunWaiter>>()

  const clearWaiter = (runId: string, waiter: RunWaiter): void => {
    const waiters = waitersByRunId.get(runId)
    if (!waiters) {
      return
    }

    waiters.delete(waiter)
    if (waiters.size === 0) {
      waitersByRunId.delete(runId)
    }
  }

  const rejectAllWaiters = (error: Error): void => {
    for (const [runId, waiters] of waitersByRunId.entries()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout)
        waiter.reject(error)
      }
      waitersByRunId.delete(runId)
    }
  }

  const extractRunId = (payload: Record<string, unknown>): string | undefined =>
    typeof payload.runId === 'string' && payload.runId.length > 0 ? payload.runId : undefined

  const notifyRun = (runId: string): void => {
    const nextVersion = (runVersionByRunId.get(runId) ?? 0) + 1
    runVersionByRunId.set(runId, nextVersion)

    const waiters = waitersByRunId.get(runId)
    if (!waiters) {
      return
    }

    for (const waiter of waiters) {
      if (nextVersion > waiter.afterVersion) {
        clearTimeout(waiter.timeout)
        waiter.resolve(nextVersion)
      }
    }
    waitersByRunId.delete(runId)
  }

  const unsubscribeMessages = eventBusListener.subscribe([...workflowEventTopics], (message) => {
    const runId = extractRunId(message.payload)
    if (runId !== undefined) {
      notifyRun(runId)
    }
  })

  const unsubscribeState = eventBusListener.onStateChange((state) => {
    if (!state.ready) {
      currentError = new WorkflowRunNotifierUnavailableError(
        state.error?.message ?? 'Workflow run notifier is unavailable',
      )
      rejectAllWaiters(currentError)
    }
  })

  return {
    isReady(): boolean {
      return eventBusListener.isReady()
    },

    getRunVersion(runId: string): number {
      return runVersionByRunId.get(runId) ?? 0
    },

    waitForRunTrigger(runId: string, afterVersion: number, timeoutMs: number): Promise<number | null> {
      if (!eventBusListener.isReady()) {
        return Promise.reject(currentError)
      }

      const currentVersion = runVersionByRunId.get(runId) ?? 0
      if (currentVersion > afterVersion) {
        return Promise.resolve(currentVersion)
      }

      return new Promise<number | null>((resolve, reject) => {
        const timeout = setTimeout(() => {
          clearWaiter(runId, waiter)
          resolve(null)
        }, timeoutMs)

        const waiter: RunWaiter = { afterVersion, resolve, reject, timeout }
        const waiters = waitersByRunId.get(runId) ?? new Set<RunWaiter>()
        waiters.add(waiter)
        waitersByRunId.set(runId, waiters)
      })
    },

    async close(): Promise<void> {
      unsubscribeMessages()
      unsubscribeState()
      rejectAllWaiters(new WorkflowRunNotifierUnavailableError('Workflow run notifier is shutting down'))
    },
  }
}
