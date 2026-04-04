import { apiEnvSchema, type ApiEnv } from '../../config/env'
import { createPinoLogger } from '@platformik/lib-logger'
import type { AppRateLimitConfigOverride } from '../../config/rate-limit'
import { registerContainerRoutes, type Container } from '../../container'
import type { IamModule } from '@platformik/module-iam/contracts'
import type { WorkflowsService } from '../../application/workflows/workflows-service'
import type { EventBusListener } from '../event-bus/event-bus.types'
import type { WorkflowRunNotifier } from '../../features/workflows/workflow-run-notifier.types'
import { createFastifyServer } from '../fastify/fastify'
import {
  createMockEventBusListener,
  createMockWorkflowRunNotifier,
  createWorkflowsServiceMocks,
  createMockWorkflowsIam,
} from './workflows-mocks'

export const createTestApiEnv = (overrides: Partial<ApiEnv> = {}): ApiEnv =>
  apiEnvSchema.parse({
    IAM_DATABASE_URL:
      'postgres://platformik-user:platformik-password@127.0.0.1:52100/platformik_iam_test?sslmode=disable',
    AUTH_BASE_URL: 'http://127.0.0.1:3000',
    AUTH_SECRET: 'test-auth-secret',
    CLIENT_ORIGIN: 'http://127.0.0.1:5173',
    WORKFLOWS_DATABASE_URL:
      'postgres://platformik-user:platformik-password@127.0.0.1:52100/platformik_workflows_test?sslmode=disable',
    WORKFLOWS_NATS_URL: 'nats://127.0.0.1:4222',
    WORKFLOWS_NATS_STREAM: 'WORKFLOW_EVENTS_TEST',
    WORKFLOWS_NATS_CONSUMER_PREFIX: 'api-workflow-events-test',
    TEMPORAL_ADDRESS: '127.0.0.1:7233',
    TEMPORAL_NAMESPACE: 'default',
    TEMPORAL_TASK_QUEUE: 'platformik-ai',
    NODE_ENV: 'test',
    BFF_PORT: 3300,
    ...overrides,
  })

export const buildIntegrationTestContainer = async (
  options: {
    env?: Partial<ApiEnv>
    deps?: {
      iam?: IamModule
      workflowsService?: WorkflowsService
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
  const workflowsService = options.deps?.workflowsService ?? createWorkflowsServiceMocks().service
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
    workflowsService,
    workflowRunNotifier,
    ...(options.deps?.rateLimitConfigOverride
      ? { rateLimitConfigOverride: options.deps.rateLimitConfigOverride }
      : {}),
  })

  const container: Container = {
    server,
    logger,
    iam,
    workflowsService,
    eventBusListener,
    workflowRunNotifier,
  }

  return { env, container }
}
