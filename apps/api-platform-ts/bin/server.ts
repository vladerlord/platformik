import { loadApiEnv } from '../src/config/env'
import { build } from '../src/container'

const env = loadApiEnv(process.env)
const container = await build(env)

const shutdown = async () => {
  console.log('Shutting down...')
  await container.server.close()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())

try {
  await container.server.listen({ port: env.BFF_PORT, host: '0.0.0.0' })
} catch (err) {
  container.server.log.error(err)
  process.exit(1)
}
