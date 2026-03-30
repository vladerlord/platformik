import { Client, Connection } from '@temporalio/client'
import { Kysely, PostgresDialect } from 'kysely'
import type { Logger } from '@platformik/lib-logger'
import { createWorkflowsModule } from '@platformik/module-workflows'
import type { WorkflowsModule } from '@platformik/module-workflows/contracts'
import type { WorkflowsDatabase } from '@platformik/module-workflows/contracts'
import { createPinoLogger } from '@platformik/lib-logger'
import type { JetStreamClient, NatsConnection } from 'nats'
import pg from 'pg'
import { ENV } from './config'
import { createWorkflowJetStream } from './ops/nats/jetstream'

export type Container = {
  logger: Logger
  temporalClient: Client
  temporalTaskQueue: string
  db: Kysely<WorkflowsDatabase>
  natsConnection: NatsConnection
  jetStream: JetStreamClient
  workflows: WorkflowsModule
}

export async function build(): Promise<Container> {
  const logger = createPinoLogger({ level: 'info', name: 'service-workflows' })

  const connection = await Connection.connect({ address: ENV.TEMPORAL_ADDRESS })
  const temporalClient = new Client({
    connection,
    namespace: ENV.TEMPORAL_NAMESPACE,
  })

  const pool = new pg.Pool({ connectionString: ENV.WORKFLOWS_DATABASE_URL })
  const db = new Kysely<WorkflowsDatabase>({
    dialect: new PostgresDialect({ pool }),
  })

  const { natsConnection, jetStream } = await createWorkflowJetStream({
    natsUrl: ENV.WORKFLOWS_NATS_URL,
    streamName: ENV.WORKFLOWS_NATS_STREAM,
    logger,
  })

  const workflows = createWorkflowsModule({ db })

  return {
    logger,
    temporalClient,
    temporalTaskQueue: ENV.TEMPORAL_TASK_QUEUE,
    db,
    natsConnection,
    jetStream,
    workflows,
  }
}

export async function close(container: Container): Promise<void> {
  await container.temporalClient.connection.close()
  await container.db.destroy()
  await container.natsConnection.drain()
  await container.natsConnection.close()
}
