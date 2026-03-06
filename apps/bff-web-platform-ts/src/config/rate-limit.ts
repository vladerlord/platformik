import { z } from 'zod'
import type { NodeEnv } from './env'

export const rateLimitRuleSchema = z.object({
  max: z.number().int().positive(),
  timeWindow: z.string().nonempty(),
})
export type RateLimitRule = z.infer<typeof rateLimitRuleSchema>

export const appRateLimitConfigSchema = z.object({
  global: rateLimitRuleSchema,
  authWrite: rateLimitRuleSchema,
})
export type AppRateLimitConfig = z.infer<typeof appRateLimitConfigSchema>

export const appRateLimitConfigOverrideSchema = z.object({
  global: rateLimitRuleSchema.partial().optional(),
  authWrite: rateLimitRuleSchema.partial().optional(),
})
export type AppRateLimitConfigOverride = z.infer<typeof appRateLimitConfigOverrideSchema>

const createAppRateLimitConfigEntry = (
  env: NodeEnv,
  config: AppRateLimitConfig,
): readonly [NodeEnv, AppRateLimitConfig] => [env, appRateLimitConfigSchema.parse(config)] as const

const appRateLimitConfigByEnv = new Map<NodeEnv, AppRateLimitConfig>([
  createAppRateLimitConfigEntry('development', {
    global: {
      max: 500,
      timeWindow: '1 minute',
    },
    authWrite: {
      max: 150,
      timeWindow: '1 minute',
    },
  }),
  createAppRateLimitConfigEntry('production', {
    global: {
      max: 100,
      timeWindow: '1 minute',
    },
    authWrite: {
      max: 5,
      timeWindow: '1 minute',
    },
  }),
  createAppRateLimitConfigEntry('test', {
    global: {
      max: 500,
      timeWindow: '1 minute',
    },
    authWrite: {
      max: 150,
      timeWindow: '1 minute',
    },
  }),
])

export const resolveAppRateLimitConfig = (
  env: NodeEnv,
  override?: AppRateLimitConfigOverride,
): AppRateLimitConfig => {
  const baseConfig = appRateLimitConfigByEnv.get(env)

  if (!baseConfig) {
    throw new Error(`Missing app rate limit config for environment: ${env}`)
  }

  const parsedOverride = appRateLimitConfigOverrideSchema.parse(override ?? {})

  return appRateLimitConfigSchema.parse({
    global: {
      ...baseConfig.global,
      ...parsedOverride.global,
    },
    authWrite: {
      ...baseConfig.authWrite,
      ...parsedOverride.authWrite,
    },
  })
}
