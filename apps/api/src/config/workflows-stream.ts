import { z } from 'zod'
import type { NodeEnv } from './env'

export const workflowStreamPolicySchema = z.object({
  heartbeatIntervalMs: z.number().int().positive(),
})

export type WorkflowStreamPolicy = z.infer<typeof workflowStreamPolicySchema>

const createWorkflowStreamPolicyEntry = (
  env: NodeEnv,
  policy: WorkflowStreamPolicy,
): readonly [NodeEnv, WorkflowStreamPolicy] => [env, workflowStreamPolicySchema.parse(policy)] as const

const workflowStreamPolicyByEnv = new Map<NodeEnv, WorkflowStreamPolicy>([
  createWorkflowStreamPolicyEntry('development', {
    heartbeatIntervalMs: 15_000,
  }),
  createWorkflowStreamPolicyEntry('production', {
    heartbeatIntervalMs: 15_000,
  }),
  createWorkflowStreamPolicyEntry('test', {
    heartbeatIntervalMs: 100,
  }),
])

export const resolveWorkflowStreamPolicy = (env: NodeEnv): WorkflowStreamPolicy => {
  const policy = workflowStreamPolicyByEnv.get(env)

  if (!policy) {
    throw new Error(`Missing workflow stream policy for environment: ${env}`)
  }

  return policy
}
