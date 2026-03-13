import { hashPassword } from 'better-auth/crypto'
import { Kysely, PostgresDialect } from 'kysely'
import type { IamDatabase } from '@platformik/module-iam-ts/contracts'
import { createPgPool } from '@platformik/runtime-pg-ts'
import { createPinoLogger } from '@platformik/runtime-pino-ts'
import { uuidv7 } from 'uuidv7'
import z from 'zod'
import { loadDatabaseEnv, nodeEnvSchema } from '../src/config/env'

const DEV_USER_ID = '01970000-0000-7000-8000-000000000001'

const ENV = {
  ...loadDatabaseEnv(process.env),
  ...z
    .object({
      NODE_ENV: nodeEnvSchema.default('development'),
      DEV_SEED_PASSWORD: z.string().min(1).optional(),
    })
    .parse(process.env),
}

const resolveDevPassword = (): string => {
  if (ENV.DEV_SEED_PASSWORD) {
    return ENV.DEV_SEED_PASSWORD
  }

  if (ENV.NODE_ENV === 'development') {
    return 'dev-password-123'
  }

  throw new Error('DEV_SEED_PASSWORD is required outside development')
}

const logger = createPinoLogger({ level: 'info', name: 'api-platform-seed' })

const pool = createPgPool(ENV.IAM_DATABASE_URL)
const db = new Kysely<IamDatabase>({
  dialect: new PostgresDialect({ pool }),
})

const now = new Date()

const devUserId = DEV_USER_ID
const devUser = {
  id: devUserId,
  name: 'Dev User',
  email: 'dev@platformik.local',
  emailVerified: true,
  image: null,
  createdAt: now,
  updatedAt: now,
}

const devAccount = {
  id: uuidv7(),
  userId: devUserId,
  accountId: devUserId,
  providerId: 'credential',
  accessToken: null,
  refreshToken: null,
  idToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
  scope: null,
  password: await hashPassword(resolveDevPassword()),
  createdAt: now,
  updatedAt: now,
}

await db
  .insertInto('user')
  .values(devUser)
  .onConflict((oc) => oc.column('email').doNothing())
  .execute()

await db
  .insertInto('account')
  .values(devAccount)
  .onConflict((oc) => oc.column('id').doNothing())
  .execute()

logger.info({ email: devUser.email }, 'Seeded dev user account')
await db.destroy()
