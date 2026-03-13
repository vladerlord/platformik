import type { Kysely } from 'kysely'
import type { IamDatabase } from '../ops/db-schema'

export const betterAuthCoreMigration = {
  up: async (db: Kysely<IamDatabase>): Promise<void> => {
    await db.schema
      .createTable('user')
      .addColumn('id', 'text', (column) => column.primaryKey())
      .addColumn('name', 'text', (column) => column.notNull())
      .addColumn('email', 'text', (column) => column.notNull().unique())
      .addColumn('emailVerified', 'boolean', (column) => column.notNull().defaultTo(false))
      .addColumn('image', 'text')
      .addColumn('createdAt', 'timestamptz', (column) => column.notNull())
      .addColumn('updatedAt', 'timestamptz', (column) => column.notNull())
      .execute()

    await db.schema
      .createTable('session')
      .addColumn('id', 'text', (column) => column.primaryKey())
      .addColumn('userId', 'text', (column) => column.notNull().references('user.id').onDelete('cascade'))
      .addColumn('token', 'text', (column) => column.notNull().unique())
      .addColumn('expiresAt', 'timestamptz', (column) => column.notNull())
      .addColumn('createdAt', 'timestamptz', (column) => column.notNull())
      .addColumn('updatedAt', 'timestamptz', (column) => column.notNull())
      .addColumn('ipAddress', 'text')
      .addColumn('userAgent', 'text')
      .execute()

    await db.schema.createIndex('session_userId_idx').on('session').column('userId').execute()

    await db.schema
      .createTable('account')
      .addColumn('id', 'text', (column) => column.primaryKey())
      .addColumn('accountId', 'text', (column) => column.notNull())
      .addColumn('providerId', 'text', (column) => column.notNull())
      .addColumn('userId', 'text', (column) => column.notNull().references('user.id').onDelete('cascade'))
      .addColumn('accessToken', 'text')
      .addColumn('refreshToken', 'text')
      .addColumn('idToken', 'text')
      .addColumn('accessTokenExpiresAt', 'timestamptz')
      .addColumn('refreshTokenExpiresAt', 'timestamptz')
      .addColumn('scope', 'text')
      .addColumn('password', 'text')
      .addColumn('createdAt', 'timestamptz', (column) => column.notNull())
      .addColumn('updatedAt', 'timestamptz', (column) => column.notNull())
      .execute()

    await db.schema.createIndex('account_userId_idx').on('account').column('userId').execute()
    await db.schema
      .createIndex('account_providerId_accountId_idx')
      .on('account')
      .columns(['providerId', 'accountId'])
      .unique()
      .execute()

    await db.schema
      .createTable('verification')
      .addColumn('id', 'text', (column) => column.primaryKey())
      .addColumn('identifier', 'text', (column) => column.notNull())
      .addColumn('value', 'text', (column) => column.notNull())
      .addColumn('expiresAt', 'timestamptz', (column) => column.notNull())
      .addColumn('createdAt', 'timestamptz', (column) => column.notNull())
      .addColumn('updatedAt', 'timestamptz', (column) => column.notNull())
      .execute()

    await db.schema
      .createIndex('verification_identifier_idx')
      .on('verification')
      .column('identifier')
      .execute()
  },
  down: async (db: Kysely<IamDatabase>): Promise<void> => {
    await db.schema.dropIndex('verification_identifier_idx').ifExists().execute()
    await db.schema.dropTable('verification').ifExists().execute()
    await db.schema.dropIndex('account_providerId_accountId_idx').ifExists().execute()
    await db.schema.dropIndex('account_userId_idx').ifExists().execute()
    await db.schema.dropTable('account').ifExists().execute()
    await db.schema.dropIndex('session_userId_idx').ifExists().execute()
    await db.schema.dropTable('session').ifExists().execute()
    await db.schema.dropTable('user').ifExists().execute()
  },
}
