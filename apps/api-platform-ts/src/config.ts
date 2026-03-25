import { z } from 'zod'

export const nodeEnvSchema = z.enum(['development', 'production', 'test'])
export type NodeEnv = z.infer<typeof nodeEnvSchema>

const envSchema = z.object({
  IAM_DATABASE_URL: z.string().min(1),
  AUTH_BASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  CLIENT_ORIGIN: z.string().min(1),
  WORKFLOWS_GRPC_ADDRESS: z.string().min(1),
  NODE_ENV: nodeEnvSchema,
  BFF_PORT: z.coerce.number().int().positive(),
})

export const ENV = envSchema.parse(process.env)
