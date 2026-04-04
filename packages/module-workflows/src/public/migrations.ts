import type { Kysely } from 'kysely'

export type WorkflowsMigrations<TDb> = Record<
  string,
  {
    up: (db: Kysely<TDb>) => Promise<void>
    down: (db: Kysely<TDb>) => Promise<void>
  }
>

export { workflowsMigrations } from '../migrations'
