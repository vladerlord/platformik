import { workflowEventEnvelopeSchema, workflowEventSubjectPattern } from '@platformik/contracts-event-bus'
import type { Logger } from '@platformik/lib-logger'
import { JSONCodec, createInbox, consumerOpts, type JetStreamSubscription, type NatsConnection } from 'nats'
import type { EventBusPolicy } from '../../config/event-bus'
import { ensureWorkflowEventsStream } from '../nats/jetstream'
import type {
  EventBusListener,
  EventBusMessage,
  EventBusState,
  EventBusSubscription,
} from './event-bus.types'
import { dispatchSubscriptions } from './event-bus.helpers'

const eventCodec = JSONCodec<unknown>()

export function createEventBusListener(options: {
  natsConnection: NatsConnection
  streamName: string
  consumerName: string
  logger: Logger
  policy: EventBusPolicy
}): EventBusListener {
  const { natsConnection, streamName, consumerName, logger, policy } = options

  let running = true
  let activeSubscription: JetStreamSubscription | null = null
  let state: EventBusState = { ready: false, error: new Error('JetStream listener is unavailable') }

  const subscriptions = new Set<EventBusSubscription>()
  const stateHandlers = new Set<(state: EventBusState) => void>()

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

    logger.info({ streamName, consumerName }, 'JetStream listener is ready')
    emitState({ ready: true, error: null })
  }

  const markUnavailable = (error: unknown): void => {
    const unavailableError = error instanceof Error ? error : new Error(String(error))
    logger.error({ err: error, streamName, consumerName }, 'JetStream listener is unavailable')
    emitState({ ready: false, error: unavailableError })
  }

  const parseEventMessage = (rawData: Uint8Array, sequence: string): EventBusMessage | null => {
    try {
      const decoded = eventCodec.decode(rawData)
      const parsed = workflowEventEnvelopeSchema.safeParse(decoded)
      if (!parsed.success) {
        logger.warn({ sequence }, 'Skipping event with invalid workflow event envelope')

        return null
      }

      return {
        topic: parsed.data.topic,
        payload: parsed.data.payload,
        sequence,
      }
    } catch (error) {
      logger.warn({ err: error, sequence }, 'Skipping event with undecodable payload')

      return null
    }
  }

  const listenLoop = async (): Promise<void> => {
    while (running) {
      try {
        const jsm = await natsConnection.jetstreamManager()
        await ensureWorkflowEventsStream({ jsm, streamName, logger })

        const js = natsConnection.jetstream()
        const opts = consumerOpts()
        opts.bindStream(streamName)
        opts.durable(consumerName)
        opts.deliverTo(createInbox())
        opts.deliverNew()
        opts.filterSubject(workflowEventSubjectPattern)
        opts.ackExplicit()
        opts.manualAck()
        opts.maxDeliver(policy.maxDeliver)
        opts.ackWait(policy.ackWaitMs)
        const subscription = await js.subscribe(workflowEventSubjectPattern, opts)
        activeSubscription = subscription

        markReady()
        for await (const message of subscription) {
          if (!running) {
            break
          }

          const sequence = String(message.seq)
          const parsed = parseEventMessage(message.data, sequence)
          if (parsed) {
            dispatchSubscriptions(subscriptions, parsed)
          }
          message.ack()
        }
        activeSubscription = null
      } catch (error) {
        if (!running) {
          break
        }

        markUnavailable(error)
        await new Promise<void>((resolve) => setTimeout(resolve, policy.reconnectDelayMs))
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
      activeSubscription?.unsubscribe()
      await loopPromise
      try {
        const jsm = await natsConnection.jetstreamManager()
        await jsm.consumers.delete(streamName, consumerName)
      } catch (error) {
        logger.warn({ err: error, streamName, consumerName }, 'Failed to cleanup JetStream consumer')
      }
    },
  }
}
