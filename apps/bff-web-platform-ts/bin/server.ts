import { buildContainer } from '../src/container'

const { server } = await buildContainer()

const port = Number(process.env['PORT'] ?? 3000)
const host = '0.0.0.0'

try {
  await server.listen({ port, host })
} catch (err) {
  server.log.error(err)
  process.exit(1)
}
