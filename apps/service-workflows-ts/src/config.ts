import { z } from 'zod'

export const nodeEnvSchema = z.enum(['development', 'production', 'test'])
export type NodeEnv = z.infer<typeof nodeEnvSchema>

const envSchema = z.object({
  TEMPORAL_ADDRESS: z.string().min(1),
  TEMPORAL_NAMESPACE: z.string().min(1),
  TEMPORAL_TASK_QUEUE: z.string().min(1),
  WORKFLOWS_DATABASE_URL: z.string().min(1),
  WORKFLOWS_REDIS_URL: z.string().min(1),
  WORKFLOWS_GRPC_ADDRESS: z.string().min(1),
  NODE_ENV: nodeEnvSchema,
})

export const ENV = envSchema.parse(process.env)
