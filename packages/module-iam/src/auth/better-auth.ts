import { kyselyAdapter } from '@better-auth/kysely-adapter'
import { betterAuth } from 'better-auth'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import type { Kysely } from 'kysely'
import type { IamDatabase } from '../db/schema'
import { uuidv7 } from 'uuidv7'

const getSecureCookies = (baseUrl: string): boolean => new URL(baseUrl).protocol === 'https:'

export type CreateBetterAuthDeps = {
  db: Kysely<IamDatabase>
  baseUrl: string
  authSecret: string
  trustedOrigins: string[]
}

export const createBetterAuth = (deps: CreateBetterAuthDeps) => {
  return betterAuth({
    secret: deps.authSecret,
    baseURL: deps.baseUrl,
    database: kyselyAdapter(deps.db, { type: 'postgres' }),
    trustedOrigins: deps.trustedOrigins,
    rateLimit: {
      enabled: false,
    },
    advanced: {
      useSecureCookies: getSecureCookies(deps.baseUrl),
      disableCSRFCheck: false,
      disableOriginCheck: false,
      ipAddress: {
        disableIpTracking: true,
      },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: getSecureCookies(deps.baseUrl),
      },
      database: {
        generateId: () => uuidv7(),
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      password: {
        hash: hashPassword,
        verify: verifyPassword,
      },
    },
  })
}
