import type { Logger } from '@platformik/lib-logger-ts'
import type Redis from 'ioredis'
import type { EventBusPolicy } from '../../config/event-bus'
import type {
  EventBusListener,
  EventBusMessage,
  EventBusState,
  EventBusSubscription,
} from './event-bus.types'
import { dispatchSubscriptions, ensureTopicCursors, nextTopics, updateCursor } from './event-bus.helpers'

export function createEventBusListener(options: {
  redis: Redis
  logger: Logger
  policy: EventBusPolicy
}): EventBusListener {
  const { redis, logger, policy } = options

  let running = true
  let state: EventBusState = { ready: false, error: new Error('Redis stream listener is unavailable') }

  const subscriptions = new Set<EventBusSubscription>()
  const stateHandlers = new Set<(state: EventBusState) => void>()
  const streamCursorByTopic = new Map<string, string>()

  const emitState = (nextState: EventBusState): void => {
    state = nextState
    for (const handler of stateHandlers) {
      handler(state)
    }
  }

  const markReady = (): void => {
    if (state.ready) {
      return
    }

    logger.info('Redis stream listener is ready')
    emitState({ ready: true, error: null })
  }

  const markUnavailable = (error: unknown): void => {
    const unavailableError = error instanceof Error ? error : new Error(String(error))
    logger.error({ err: error }, 'Redis stream listener is unavailable')
    emitState({ ready: false, error: unavailableError })
  }

  const listenLoop = async (): Promise<void> => {
    while (running) {
      try {
        if (!state.ready) {
          await redis.ping()
          markReady()
        }

        const topics = nextTopics(subscriptions)
        ensureTopicCursors(topics, streamCursorByTopic)
        if (topics.length === 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, policy.idleWaitMs))
          continue
        }

        const cursors = topics.map((topic) => streamCursorByTopic.get(topic) ?? '$')
        const response = await redis.xread(
          'BLOCK',
          policy.redisBlockTimeoutMs,
          'STREAMS',
          ...topics,
          ...cursors,
        )

        if (!running || response === null) {
          continue
        }

        for (const [topic, entries] of response) {
          for (const [streamId, fields] of entries) {
            updateCursor(streamCursorByTopic, topic, streamId)
            dispatchSubscriptions(subscriptions, { topic, streamId, fields })
          }
        }
      } catch (error) {
        if (!running) {
          break
        }

        markUnavailable(error)
        await new Promise<void>((resolve) => setTimeout(resolve, policy.redisReconnectDelayMs))
      }
    }
  }

  const loopPromise = listenLoop().catch((error: unknown) => {
    markUnavailable(error)
  })

  return {
    isReady(): boolean {
      return state.ready
    },

    subscribe(topics: string[], handler: (message: EventBusMessage) => void): () => void {
      const subscription: EventBusSubscription = { topics: new Set(topics), handler }
      subscriptions.add(subscription)

      return () => {
        subscriptions.delete(subscription)
      }
    },

    onStateChange(handler: (state: EventBusState) => void): () => void {
      stateHandlers.add(handler)
      handler(state)

      return () => {
        stateHandlers.delete(handler)
      }
    },

    async close(): Promise<void> {
      running = false
      await loopPromise
    },
  }
}
