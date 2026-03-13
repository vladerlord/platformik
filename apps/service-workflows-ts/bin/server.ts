import { NativeConnection, Worker } from '@temporalio/worker'
import { ENV } from '../src/config'
import { build, close } from '../src/container'
import { buildGrpcServer } from '../src/grpc/server'
import { createActivities } from '../src/temporal/activities'
import { startOutboxDispatcher } from '../src/outbox-dispatcher'

const container = await build()
const { logger } = container
const grpcServer = buildGrpcServer(container)

const activities = createActivities(container.workflows)

const nativeConnection = await NativeConnection.connect({ address: ENV.TEMPORAL_ADDRESS })
const worker = await Worker.create({
  workflowsPath: new URL('../src/temporal/workflow.ts', import.meta.url).pathname,
  activities,
  taskQueue: ENV.TEMPORAL_TASK_QUEUE,
  connection: nativeConnection,
  namespace: ENV.TEMPORAL_NAMESPACE,
})

const stopOutboxDispatcher = startOutboxDispatcher(container)

const shutdown = async () => {
  logger.info('Shutting down...')
  await stopOutboxDispatcher()
  await grpcServer.shutdown()
  worker.shutdown()
  await nativeConnection.close()
  await close(container)
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())

try {
  logger.info(`Starting gRPC server on ${ENV.WORKFLOWS_GRPC_ADDRESS}`)
  await Promise.all([grpcServer.listen(ENV.WORKFLOWS_GRPC_ADDRESS), worker.run()])
} catch (err) {
  logger.error({ err }, 'Failed to start server')
  process.exit(1)
}
