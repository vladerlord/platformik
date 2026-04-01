import type { IamMigrations } from '../public/migrations'
import type { IamDatabase } from '../db/schema'
import { betterAuthCoreMigration } from './001-betterauth-core'

export const iamMigrations: IamMigrations<IamDatabase> = {
  '001-betterauth-core': betterAuthCoreMigration,
}
