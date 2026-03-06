import pg from 'pg'

export type PgPoolConfig = {
  dsn: string
  max?: number
  idleTimeoutMs?: number
  connectionTimeoutMs?: number
}

export const createPgPool = (dsn: string, config?: Omit<PgPoolConfig, 'dsn'>): pg.Pool =>
  new pg.Pool({
    connectionString: dsn,
    max: config?.max ?? 10,
    idleTimeoutMillis: config?.idleTimeoutMs ?? 30_000,
    connectionTimeoutMillis: config?.connectionTimeoutMs ?? 5_000,
  })
