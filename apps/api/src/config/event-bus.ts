import { z } from 'zod'
import type { NodeEnv } from './env'

export const eventBusPolicySchema = z.object({
  ackWaitMs: z.number().int().positive(),
  maxDeliver: z.number().int().positive(),
  reconnectDelayMs: z.number().int().positive(),
})

export type EventBusPolicy = z.infer<typeof eventBusPolicySchema>

const createEventBusPolicyEntry = (
  env: NodeEnv,
  policy: EventBusPolicy,
): readonly [NodeEnv, EventBusPolicy] => [env, eventBusPolicySchema.parse(policy)] as const

const eventBusPolicyByEnv = new Map<NodeEnv, EventBusPolicy>([
  createEventBusPolicyEntry('development', {
    ackWaitMs: 30_000,
    maxDeliver: 20,
    reconnectDelayMs: 1_000,
  }),
  createEventBusPolicyEntry('production', {
    ackWaitMs: 30_000,
    maxDeliver: 20,
    reconnectDelayMs: 1_000,
  }),
  createEventBusPolicyEntry('test', {
    ackWaitMs: 10_000,
    maxDeliver: 5,
    reconnectDelayMs: 20,
  }),
])

export const resolveEventBusPolicy = (env: NodeEnv): EventBusPolicy => {
  const policy = eventBusPolicyByEnv.get(env)

  if (!policy) {
    throw new Error(`Missing event bus policy for environment: ${env}`)
  }

  return policy
}
