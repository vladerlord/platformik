import type { IamMigrations } from '../src/contracts'
import type { IamDatabase } from '../src/ops/db-schema'
import { betterAuthCoreMigration } from './001-betterauth-core'

export const iamMigrations: IamMigrations<IamDatabase> = {
  '001-betterauth-core': betterAuthCoreMigration,
}
