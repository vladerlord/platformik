import { z } from 'zod'

export const nodeEnvSchema = z.enum(['development', 'production', 'test'])
export type NodeEnv = z.infer<typeof nodeEnvSchema>
