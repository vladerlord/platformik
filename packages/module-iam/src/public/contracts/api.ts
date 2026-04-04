import type { Kysely } from 'kysely'
import type { IamDatabase } from '../../db/schema'
import type {
  GetSessionResult,
  SignInBody,
  SignInResult,
  SignOutResult,
  SignUpBody,
  SignUpResult,
} from './auth'

export type IamModule = {
  auth: {
    signUp: (body: SignUpBody, headers: Headers) => Promise<SignUpResult>
    signIn: (body: SignInBody, headers: Headers) => Promise<SignInResult>
    signOut: (headers: Headers) => Promise<SignOutResult>
    getSession: (headers: Headers) => Promise<GetSessionResult>
  }
}

export type IamModuleDeps = {
  db: Kysely<IamDatabase>
  baseUrl: string
  authSecret: string
  trustedOrigins: string[]
}
