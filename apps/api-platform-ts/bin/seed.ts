import { hashPassword } from 'better-auth/crypto'
import { Kysely, PostgresDialect } from 'kysely'
import type { IamDatabase } from '@platformik/module-iam-ts/contracts'
import { createPgPool } from '@platformik/runtime-pg-ts'
import { createPinoLogger } from '@platformik/runtime-pino-ts'
import { uuidv7 } from 'uuidv7'
import z from 'zod'

const DEV_USER_ID = '01970000-0000-7000-8000-000000000001'

const envSchema = z.object({
  IAM_DATABASE_URL: z.string().min(1),
})
const ENV = envSchema.parse(process.env)

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
  password: await hashPassword('dev-password-123'),
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

logger.info(`Seeded dev user: ${devUser.email} / dev-password-123`)
await db.destroy()
