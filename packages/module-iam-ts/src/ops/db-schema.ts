import type { Generated } from 'kysely'

export interface IamUserTable {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
}

export interface IamSessionTable {
  id: string
  userId: string
  token: string
  expiresAt: Date
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
}

export interface IamAccountTable {
  id: string
  userId: string
  accountId: string
  providerId: string
  accessToken: string | null
  refreshToken: string | null
  idToken: string | null
  accessTokenExpiresAt: Date | null
  refreshTokenExpiresAt: Date | null
  scope: string | null
  password: string | null
  createdAt: Date
  updatedAt: Date
}

export interface IamVerificationTable {
  id: string
  identifier: string
  value: string
  expiresAt: Date
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
}

export interface IamDatabase {
  user: IamUserTable
  session: IamSessionTable
  account: IamAccountTable
  verification: IamVerificationTable
}
