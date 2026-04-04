import { createInternalIamAuth } from './auth/auth'
import type { IamModule, IamModuleDeps } from './public/contracts/api'

export const createIamModule = (deps: IamModuleDeps): IamModule => {
  const auth = createInternalIamAuth(deps)

  return {
    auth,
  }
}
