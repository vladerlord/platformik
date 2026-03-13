import { iamMigrations } from '@platformik/module-iam-ts'
import type { IamDatabase } from '@platformik/module-iam-ts/contracts'
import { createPgPool } from '@platformik/runtime-pg-ts'
import { Kysely, Migrator, PostgresDialect } from 'kysely'
import z from 'zod'

const envSchema = z.object({
  IAM_DATABASE_URL: z.string().nonempty(),
})
const ENV = envSchema.parse(process.env)

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
    console.log(`${migration.migrationName}: ${migration.status}`)
  }
} finally {
  await db.destroy()
}
