import type { IamModule, IamModuleDeps } from './contracts'
import { createInternalIamAuth } from './auth/auth'

export const createIamModule = (deps: IamModuleDeps): IamModule => {
  const auth = createInternalIamAuth(deps)

  return {
    auth,
  }
}
