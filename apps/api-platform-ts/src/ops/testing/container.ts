import { apiEnvSchema, type ApiEnv } from '../../config/env'
import { createFastifyServer } from '@platformik/runtime-fastify-ts'
import { createPinoLogger } from '@platformik/runtime-pino-ts'
import type { AppRateLimitConfigOverride } from '../../config/rate-limit'
import { registerContainerRoutes, type Container } from '../../container'
import type { IamModule } from '@platformik/module-iam-ts/contracts'
import type { WorkflowsClient } from '../../container'
import type { EventBusListener } from '../event-bus/event-bus.types'
import type { WorkflowRunNotifier } from '../../features/workflows/workflow-run-notifier.types'
import {
  createMockEventBusListener,
  createMockWorkflowRunNotifier,
  createWorkflowsClientMocks,
  createMockWorkflowsIam,
} from './workflows-mocks'

export const createTestApiEnv = (overrides: Partial<ApiEnv> = {}): ApiEnv =>
  apiEnvSchema.parse({
    IAM_DATABASE_URL:
      'postgres://platformik-user:platformik-password@127.0.0.1:52100/platformik_iam_test?sslmode=disable',
    AUTH_BASE_URL: 'http://127.0.0.1:3000',
    AUTH_SECRET: 'test-auth-secret',
    CLIENT_ORIGIN: 'http://127.0.0.1:5173',
    WORKFLOWS_GRPC_ADDRESS: '127.0.0.1:9090',
    WORKFLOWS_REDIS_URL: 'redis://127.0.0.1:52101',
    NODE_ENV: 'test',
    BFF_PORT: 3300,
    ...overrides,
  })

export const buildIntegrationTestContainer = async (
  options: {
    env?: Partial<ApiEnv>
    deps?: {
      iam?: IamModule
      workflowsClient?: WorkflowsClient
      eventBusListener?: EventBusListener
      workflowRunNotifier?: WorkflowRunNotifier
      rateLimitConfigOverride?: AppRateLimitConfigOverride
    }
  } = {},
): Promise<{ env: ApiEnv; container: Container }> => {
  const env = createTestApiEnv(options.env)
  const logger = createPinoLogger({ level: 'fatal', name: 'api-platform-test' })
  const server = createFastifyServer({ logger })
  const iam = options.deps?.iam ?? createMockWorkflowsIam()
  const workflowsClient = options.deps?.workflowsClient ?? createWorkflowsClientMocks().client
  const eventBusListener = options.deps?.eventBusListener ?? createMockEventBusListener()
  const workflowRunNotifier = options.deps?.workflowRunNotifier ?? createMockWorkflowRunNotifier()

  server.addHook('onClose', async () => {
    await workflowRunNotifier.close()
    await eventBusListener.close()
  })

  await registerContainerRoutes({
    env,
    server,
    iam,
    workflowsClient,
    workflowRunNotifier,
    ...(options.deps?.rateLimitConfigOverride
      ? { rateLimitConfigOverride: options.deps.rateLimitConfigOverride }
      : {}),
  })

  const container: Container = {
    server,
    logger,
    iam,
    workflowsClient,
    eventBusListener,
    workflowRunNotifier,
  }

  return { env, container }
}
