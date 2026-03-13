import { z } from 'zod'
import type { NodeEnv } from './env'

export const eventBusPolicySchema = z.object({
  redisBlockTimeoutMs: z.number().int().positive(),
  redisReconnectDelayMs: z.number().int().positive(),
  idleWaitMs: z.number().int().positive(),
})

export type EventBusPolicy = z.infer<typeof eventBusPolicySchema>

const createEventBusPolicyEntry = (
  env: NodeEnv,
  policy: EventBusPolicy,
): readonly [NodeEnv, EventBusPolicy] => [env, eventBusPolicySchema.parse(policy)] as const

const eventBusPolicyByEnv = new Map<NodeEnv, EventBusPolicy>([
  createEventBusPolicyEntry('development', {
    redisBlockTimeoutMs: 5_000,
    redisReconnectDelayMs: 1_000,
    idleWaitMs: 200,
  }),
  createEventBusPolicyEntry('production', {
    redisBlockTimeoutMs: 5_000,
    redisReconnectDelayMs: 1_000,
    idleWaitMs: 200,
  }),
  createEventBusPolicyEntry('test', {
    redisBlockTimeoutMs: 100,
    redisReconnectDelayMs: 20,
    idleWaitMs: 20,
  }),
])

export const resolveEventBusPolicy = (env: NodeEnv): EventBusPolicy => {
  const policy = eventBusPolicyByEnv.get(env)

  if (!policy) {
    throw new Error(`Missing event bus policy for environment: ${env}`)
  }

  return policy
}
