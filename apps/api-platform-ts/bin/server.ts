import { ENV } from '../src/config'
import { build } from '../src/container'

const container = await build()

const shutdown = async () => {
  console.log('Shutting down...')
  await container.server.close()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())

try {
  await container.server.listen({ port: ENV.BFF_PORT, host: '0.0.0.0' })
} catch (err) {
  container.server.log.error(err)
  process.exit(1)
}
