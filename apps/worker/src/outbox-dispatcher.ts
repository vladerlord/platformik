import { workflowEventEnvelopeSchema } from '@platformik/contracts-event-bus'
import { JSONCodec } from 'nats'
import type { Container } from './container'

const POLL_INTERVAL_MS = 1000
const BATCH_SIZE = 50
const MAX_ATTEMPTS = 10
const eventCodec = JSONCodec<unknown>()

export function startOutboxDispatcher(container: Container): () => Promise<void> {
  const { logger, workflows, jetStream } = container
  let running = true
  let currentTick: Promise<void> = Promise.resolve()

  const tick = async (): Promise<void> => {
    const result = await workflows.getPendingOutboxEntries(BATCH_SIZE)
    if (result.isErr()) {
      logger.error({ err: result.error }, 'Failed to fetch pending outbox entries')

      return
    }

    const entries = result.value.filter((e) => e.attempts < MAX_ATTEMPTS)

    if (entries.length < result.value.length) {
      const skipped = result.value.length - entries.length
      logger.error({ skipped }, 'Skipping outbox entries that exceeded max attempts')
    }

    for (const entry of entries) {
      const parsedEnvelope = workflowEventEnvelopeSchema.safeParse({
        topic: entry.topic,
        payload: entry.payload,
      })
      if (!parsedEnvelope.success) {
        logger.error(
          { entryId: entry.id, topic: entry.topic },
          'Invalid workflow event envelope, skipping outbox entry',
        )

        const incementResult = await workflows.incrementOutboxAttempts(entry.id)
        if (incementResult.isErr()) {
          logger.error(
            { err: incementResult.error, entryId: entry.id },
            'Failed to increment outbox attempts',
          )
        }
        continue
      }

      // Publish to NATS JetStream
      try {
        await jetStream.publish(entry.topic, eventCodec.encode(parsedEnvelope.data), { msgID: entry.id })
      } catch (err) {
        logger.warn(
          { err, entryId: entry.id, topic: entry.topic },
          'Failed to publish outbox entry to JetStream — will retry',
        )
        const incementResult = await workflows.incrementOutboxAttempts(entry.id)
        if (incementResult.isErr()) {
          logger.error(
            { err: incementResult.error, entryId: entry.id },
            'Failed to increment outbox attempts',
          )
        }
        continue
      }

      // Mark as published — publish already succeeded, so at-least-once delivery applies if this fails
      const markResult = await workflows.markOutboxEntryPublished(entry.id)
      if (markResult.isErr()) {
        logger.error(
          { err: markResult.error, entryId: entry.id },
          'Published to JetStream but failed to mark outbox entry as published — entry will be re-published on next tick (at-least-once)',
        )
      }
    }
  }

  const loop = async (): Promise<void> => {
    while (running) {
      currentTick = tick().catch((err: unknown) => {
        logger.error({ err }, 'Unexpected error in outbox dispatcher tick')
      })

      await currentTick
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }

  void loop()

  return async () => {
    running = false
    await currentTick
  }
}
