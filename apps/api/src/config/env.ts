import { z } from 'zod'

export const nodeEnvSchema = z.enum(['development', 'production', 'test'])
export type NodeEnv = z.infer<typeof nodeEnvSchema>

export const databaseEnvSchema = z.object({
  IAM_DATABASE_URL: z.string().min(1),
  WORKFLOWS_DATABASE_URL: z.string().min(1),
})
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>

export const apiEnvSchema = databaseEnvSchema.extend({
  AUTH_BASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  CLIENT_ORIGIN: z.string().min(1),
  WORKFLOWS_DATABASE_URL: z.string().min(1),
  WORKFLOWS_NATS_URL: z.string().min(1),
  WORKFLOWS_NATS_STREAM: z.string().min(1),
  WORKFLOWS_NATS_CONSUMER_PREFIX: z.string().min(1),
  TEMPORAL_ADDRESS: z.string().min(1),
  TEMPORAL_NAMESPACE: z.string().min(1),
  TEMPORAL_TASK_QUEUE: z.string().min(1),
  NODE_ENV: nodeEnvSchema,
  BFF_PORT: z.coerce.number().int().positive(),
})

export type ApiEnv = z.infer<typeof apiEnvSchema>

export const loadDatabaseEnv = (input: Record<string, string | undefined>): DatabaseEnv =>
  databaseEnvSchema.parse(input)

export const loadApiEnv = (input: Record<string, string | undefined>): ApiEnv => apiEnvSchema.parse(input)
