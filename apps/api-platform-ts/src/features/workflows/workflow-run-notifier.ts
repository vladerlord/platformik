import type { Logger } from '@platformik/lib-logger-ts'
import type { EventBusListener } from '../../ops/event-bus/event-bus.types'
import type { RunWaiter, WorkflowRunNotifier } from './workflow-run-notifier.types'

const WORKFLOW_EVENT_TOPICS = [
  'workflow.run.started',
  'workflow.message.created',
  'workflow.answer.received',
  'workflow.run.completed',
  'workflow.run.failed',
] as const

export class WorkflowRunNotifierUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowRunNotifierUnavailableError'
  }
}

export function createWorkflowRunNotifier(options: {
  eventBusListener: EventBusListener
  logger: Logger
}): WorkflowRunNotifier {
  const { eventBusListener, logger } = options

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

  const extractRunId = (fields: string[]): string | undefined => {
    for (let index = 0; index < fields.length - 1; index += 2) {
      if (fields[index] !== 'payload') {
        continue
      }

      const payloadRaw = fields[index + 1]
      if (payloadRaw === undefined) {
        continue
      }

      try {
        const payload = JSON.parse(payloadRaw) as { runId?: unknown }
        if (typeof payload.runId === 'string' && payload.runId.length > 0) {
          return payload.runId
        }
      } catch (error) {
        logger.warn({ err: error, payloadRaw }, 'Failed to parse workflow event payload')
      }
    }

    return undefined
  }

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

  const unsubscribeMessages = eventBusListener.subscribe([...WORKFLOW_EVENT_TOPICS], (message) => {
    const runId = extractRunId(message.fields)
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
