import type { IamMigrations } from '../contracts'
import type { IamDatabase } from '../db/schema'
import { betterAuthCoreMigration } from './001-betterauth-core'

export const iamMigrations: IamMigrations<IamDatabase> = {
  '001-betterauth-core': betterAuthCoreMigration,
}
