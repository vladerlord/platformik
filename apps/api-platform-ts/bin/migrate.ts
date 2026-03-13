import { iamMigrations } from '@platformik/module-iam-ts'
import type { IamDatabase } from '@platformik/module-iam-ts/contracts'
import { createPgPool } from '@platformik/runtime-pg-ts'
import { createPinoLogger } from '@platformik/runtime-pino-ts'
import { Kysely, Migrator, PostgresDialect } from 'kysely'
import { loadDatabaseEnv } from '../src/config/env'

const ENV = loadDatabaseEnv(process.env)

const logger = createPinoLogger({ level: 'info', name: 'api-platform-migrate' })

const pool = createPgPool(ENV.IAM_DATABASE_URL)
const db = new Kysely<IamDatabase>({
  dialect: new PostgresDialect({ pool }),
})

const migrator = new Migrator({
  db,
  provider: {
    getMigrations: async () => iamMigrations,
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
