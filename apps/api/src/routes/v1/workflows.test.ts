import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type { FastifyInstance } from '../../ops/fastify/fastify'
import { WorkflowsServiceError } from '../../application/workflows/workflows-service'
import { parseJsonBody } from '../../ops/testing/http'
import { buildIntegrationTestContainer } from '../../ops/testing/container'
import {
  createMockEventBusListener,
  createMockWorkflowRunNotifier,
  createMockWorkflowsIam,
  createWorkflowsServiceMocks,
  resetWorkflowsServiceMocks,
} from '../../ops/testing/workflows-mocks'

const workflows = createWorkflowsServiceMocks()
const iam = createMockWorkflowsIam()
const eventBusListener = createMockEventBusListener()
const workflowRunNotifier = createMockWorkflowRunNotifier()
let server: FastifyInstance

beforeAll(async () => {
  const result = await buildIntegrationTestContainer({
    deps: {
      iam,
      workflowsService: workflows.service,
      eventBusListener,
      workflowRunNotifier,
    },
  })

  server = result.container.server
})

afterAll(async () => {
  if (server) {
    await server.close()
  }
})

beforeEach(() => {
  resetWorkflowsServiceMocks(workflows)
})

describe('workflows routes', () => {
  test('returns 401 when authorization header is missing', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/workflows',
    })

    expect(response.statusCode).toBe(401)
    expect(parseJsonBody(response.body)).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Missing authorization header' },
    })
  })

  test('rejects empty submitAnswer payload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/workflows/runs/run-1/answer',
      headers: { authorization: 'Bearer token' },
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(parseJsonBody(response.body)).toEqual({
      error: { code: 'INVALID_ARGUMENT', message: 'Invalid request body' },
    })
  })

  test('rejects conflicting submitAnswer payload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/workflows/runs/run-1/answer',
      headers: { authorization: 'Bearer token' },
      payload: { optionId: 'o-1', rawInput: 'hello' },
    })

    expect(response.statusCode).toBe(400)
    expect(parseJsonBody(response.body)).toEqual({
      error: { code: 'INVALID_ARGUMENT', message: 'Invalid request body' },
    })
  })

  test.each([
    {
      payload: { optionId: 'option-1' },
      expectedSelectOption: { optionId: 'option-1' },
    },
    {
      payload: { rawInput: 'free text' },
      expectedSelectOption: { rawInput: 'free text' },
    },
  ])('accepts valid submitAnswer payload %#', async ({ payload, expectedSelectOption }) => {
    workflows.submitAnswer.mockResolvedValueOnce(undefined)

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/workflows/runs/run-1/answer',
      headers: { authorization: 'Bearer token' },
      payload,
    })

    expect(response.statusCode).toBe(200)
    expect(parseJsonBody(response.body)).toEqual({ ok: true })
    expect(workflows.submitAnswer).toHaveBeenCalledTimes(1)
    const request = workflows.submitAnswer.mock.calls[0][0]
    expect(request.workflowRunId).toBe('run-1')
    expect(request.selectOption).toEqual(expectedSelectOption)
  })

  test('maps workflows errors to expected HTTP status', async () => {
    workflows.listWorkflows.mockRejectedValueOnce(
      new WorkflowsServiceError(404, 'NOT_FOUND', 'Workflow not found'),
    )

    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/workflows',
      headers: { authorization: 'Bearer token' },
    })

    expect(response.statusCode).toBe(404)
    expect(parseJsonBody(response.body)).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Workflow not found',
      },
    })
  })

  test('builds typed getRunView request with afterId', async () => {
    const getWorkflowRunView = vi.fn().mockResolvedValue({
      conversationId: { value: 'conversation-1' },
      status: 'WORKFLOW_RUN_STATUS_RUNNING',
      currentNodeId: 'node-1',
      revision: 1,
      lastMessageId: { value: 'message-1' },
      messages: [],
      pendingInput: undefined,
    })
    workflows.getWorkflowRunView.mockImplementationOnce(getWorkflowRunView)

    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/workflows/runs/run-2?afterId=message-42',
      headers: { authorization: 'Bearer token' },
    })

    expect(response.statusCode).toBe(200)
    expect(getWorkflowRunView).toHaveBeenCalledTimes(1)
    expect(getWorkflowRunView.mock.calls[0][0]).toEqual({
      workflowRunId: 'run-2',
      afterId: 'message-42',
      context: { userId: 'user-1' },
    })
  })
})
