import { workflowEventSubjectPattern } from '@platformik/contracts-event-bus'
import type { Logger } from '@platformik/lib-logger'
import { NatsError, type JetStreamManager } from 'nats'

const isStreamNotFound = (error: unknown): boolean =>
  error instanceof NatsError && error.jsError()?.code === 404

export async function ensureWorkflowEventsStream(options: {
  jsm: JetStreamManager
  streamName: string
  logger: Logger
}): Promise<void> {
  const { jsm, streamName, logger } = options

  try {
    await jsm.streams.info(streamName)
    logger.info({ streamName }, 'JetStream stream is available')

    return
  } catch (error) {
    if (!isStreamNotFound(error)) {
      throw error
    }
    logger.info({ streamName }, 'JetStream stream not found, creating stream')
  }

  try {
    await jsm.streams.add({
      name: streamName,
      subjects: [workflowEventSubjectPattern],
    })
    logger.info({ streamName }, 'Created JetStream stream for workflow events')
  } catch (error) {
    try {
      await jsm.streams.info(streamName)
      logger.info({ streamName }, 'JetStream stream already exists after create race')
    } catch {
      throw error
    }
  }
}
