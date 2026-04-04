import { workflowEventSubjectPattern } from '@platformik/contracts-event-bus'
import type { Logger } from '@platformik/lib-logger'
import type { JetStreamClient, JetStreamManager, NatsConnection } from 'nats'
import { NatsError, connect } from 'nats'

const isStreamNotFound = (error: unknown): boolean =>
  error instanceof NatsError && error.jsError()?.code === 404

async function ensureWorkflowEventsStream(options: {
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
      logger.error({ err: error, streamName }, 'Failed to lookup JetStream stream')
      throw error
    }

    logger.info({ streamName }, 'JetStream stream not found, creating stream')
  }

  try {
    await jsm.streams.add({
      name: streamName,
      subjects: [workflowEventSubjectPattern],
    })
    logger.info({ streamName }, 'Created JetStream stream')
  } catch (error) {
    try {
      await jsm.streams.info(streamName)
      logger.info({ streamName }, 'JetStream stream already exists after create race')
    } catch {
      logger.error({ err: error, streamName }, 'Failed to create JetStream stream')
      throw error
    }
  }
}

export async function createWorkflowJetStream(options: {
  natsUrl: string
  streamName: string
  logger: Logger
}): Promise<{ natsConnection: NatsConnection; jetStream: JetStreamClient }> {
  const { natsUrl, streamName, logger } = options

  const natsConnection = await connect({ servers: natsUrl })
  const jetStreamManager = await natsConnection.jetstreamManager()
  await ensureWorkflowEventsStream({ jsm: jetStreamManager, streamName, logger })
  const jetStream = natsConnection.jetstream()

  return { natsConnection, jetStream }
}
