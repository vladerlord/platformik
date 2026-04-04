import type { Kysely } from 'kysely'

export type IamMigrations<TDb> = Record<
  string,
  {
    up: (db: Kysely<TDb>) => Promise<void>
    down: (db: Kysely<TDb>) => Promise<void>
  }
>

export { iamMigrations } from '../migrations'
