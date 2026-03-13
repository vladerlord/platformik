import { createInternalIamAuth } from './auth/auth'
import type { IamModule, IamModuleDeps } from './contracts'

export const createIamModule = (deps: IamModuleDeps): IamModule => {
  const auth = createInternalIamAuth(deps)

  return {
    auth,
  }
}

export { iamMigrations } from './migrations'
