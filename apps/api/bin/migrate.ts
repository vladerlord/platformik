import { iamMigrations } from '@platformik/module-iam'
import type { IamDatabase } from '@platformik/module-iam/contracts'
import { workflowsMigrations } from '@platformik/module-workflows'
import type { WorkflowsDatabase } from '@platformik/module-workflows/contracts'
import { createPinoLogger } from '@platformik/lib-logger'
import { Kysely, Migrator, PostgresDialect } from 'kysely'
import { loadDatabaseEnv } from '../src/config/env'
import { createPgPool } from '../src/ops/pg/pg'

const ENV = loadDatabaseEnv(process.env)

const logger = createPinoLogger({ level: 'info', name: 'api-platform-migrate' })

const iamDb = new Kysely<IamDatabase>({
  dialect: new PostgresDialect({ pool: createPgPool(ENV.IAM_DATABASE_URL) }),
})

const workflowsDb = new Kysely<WorkflowsDatabase>({
  dialect: new PostgresDialect({ pool: createPgPool(ENV.WORKFLOWS_DATABASE_URL) }),
})

const iamMigrator = new Migrator({
  db: iamDb,
  provider: {
    getMigrations: async () => iamMigrations,
  },
})

const workflowsMigrator = new Migrator({
  db: workflowsDb,
  provider: {
    getMigrations: async () => workflowsMigrations,
  },
})

try {
  const iamResult = await iamMigrator.migrateToLatest()
  const workflowsResult = await workflowsMigrator.migrateToLatest()

  if (iamResult.error) {
    throw iamResult.error
  }
  if (workflowsResult.error) {
    throw workflowsResult.error
  }

  for (const migration of iamResult.results ?? []) {
    logger.info(`iam ${migration.migrationName}: ${migration.status}`)
  }
  for (const migration of workflowsResult.results ?? []) {
    logger.info(`workflows ${migration.migrationName}: ${migration.status}`)
  }
} finally {
  await workflowsDb.destroy()
  await iamDb.destroy()
}
