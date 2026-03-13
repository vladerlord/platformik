import { Client, Connection } from '@temporalio/client'
import { Kysely, PostgresDialect } from 'kysely'
import Redis from 'ioredis'
import type { Logger } from '@platformik/lib-logger-ts'
import { createWorkflowsModule } from '@platformik/module-workflows-ts'
import type { WorkflowsModule } from '@platformik/module-workflows-ts/contracts'
import type { WorkflowsDatabase } from '@platformik/module-workflows-ts/contracts'
import { createPinoLogger } from '@platformik/runtime-pino-ts'
import pg from 'pg'
import { ENV } from './config'

export type Container = {
  logger: Logger
  temporalClient: Client
  temporalTaskQueue: string
  db: Kysely<WorkflowsDatabase>
  redis: Redis
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

  const redis = new Redis(ENV.WORKFLOWS_REDIS_URL)

  const workflows = createWorkflowsModule({ db })

  return { logger, temporalClient, temporalTaskQueue: ENV.TEMPORAL_TASK_QUEUE, db, redis, workflows }
}

export async function close(container: Container): Promise<void> {
  await container.temporalClient.connection.close()
  await container.db.destroy()
  container.redis.disconnect()
}
