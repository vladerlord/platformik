import { Migrator, Kysely, PostgresDialect } from 'kysely'
import { workflowsMigrations } from '@platformik/module-workflows-ts'
import type { WorkflowsDatabase } from '@platformik/module-workflows-ts/contracts'
import { createPinoLogger } from '@platformik/runtime-pino-ts'
import pg from 'pg'
import { ENV } from '../src/config'

const logger = createPinoLogger({ level: 'info', name: 'service-workflows-migrate' })

const pool = new pg.Pool({ connectionString: ENV.WORKFLOWS_DATABASE_URL })
const db = new Kysely<WorkflowsDatabase>({
  dialect: new PostgresDialect({ pool }),
})

const migrator = new Migrator({
  db,
  provider: {
    getMigrations: async () => workflowsMigrations,
  },
})

try {
  const result = await migrator.migrateToLatest()

  if (result.error) {
    throw result.error
  }

  for (const migration of result.results ?? []) {
    logger.info(`${migration.migrationName}: ${migration.status}`)
  }
} finally {
  await db.destroy()
}
