import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type {
  GetWorkflowRunViewRequest,
  GetWorkflowRunViewResponse,
} from '@platformik/contracts-workflows-ts'
import { WorkflowRunStatus } from '@platformik/contracts-workflows-ts'
import type { FastifyInstance } from '@platformik/runtime-fastify-ts'
import { ServerError } from 'nice-grpc'
import { parseJsonBody } from '../../ops/testing/http'
import { buildIntegrationTestContainer } from '../../ops/testing/container'
import {
  createMockEventBusListener,
  createMockWorkflowRunNotifier,
  createMockWorkflowsIam,
  createWorkflowsClientMocks,
  resetWorkflowsClientMocks,
} from '../../ops/testing/workflows-mocks'

const grpc = createWorkflowsClientMocks()
const iam = createMockWorkflowsIam()
const eventBusListener = createMockEventBusListener()
const workflowRunNotifier = createMockWorkflowRunNotifier()
let server: FastifyInstance

beforeAll(async () => {
  const result = await buildIntegrationTestContainer({
    deps: {
      iam,
      workflowsClient: grpc.client,
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
  resetWorkflowsClientMocks(grpc)
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
    grpc.submitAnswer.mockResolvedValueOnce({})

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/workflows/runs/run-1/answer',
      headers: { authorization: 'Bearer token' },
      payload,
    })

    expect(response.statusCode).toBe(200)
    expect(parseJsonBody(response.body)).toEqual({ ok: true })
    expect(grpc.submitAnswer).toHaveBeenCalledTimes(1)
    const request = grpc.submitAnswer.mock.calls[0][0]
    expect(request.workflowRunId?.value).toBe('run-1')
    expect(request.selectOption).toEqual(expectedSelectOption)
  })

  test('maps grpc errors to expected HTTP status', async () => {
    grpc.listWorkflows.mockRejectedValueOnce(new ServerError(5, 'Workflow not found'))

    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/workflows',
      headers: { authorization: 'Bearer token' },
    })

    expect(response.statusCode).toBe(404)
    expect(parseJsonBody(response.body)).toEqual({
      error: {
        code: '5',
        message: 'Workflow not found',
      },
    })
  })

  test('builds typed getRunView request with afterId', async () => {
    const getWorkflowRunView = vi
      .fn<(request: GetWorkflowRunViewRequest) => Promise<GetWorkflowRunViewResponse>>()
      .mockResolvedValue({
        conversationId: { value: 'conversation-1' },
        status: WorkflowRunStatus.WORKFLOW_RUN_STATUS_RUNNING,
        currentNodeId: 'node-1',
        revision: 1,
        lastMessageId: { value: 'message-1' },
        messages: [],
        pendingInput: undefined,
      })
    grpc.getWorkflowRunView.mockImplementationOnce(getWorkflowRunView)

    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/workflows/runs/run-2?afterId=message-42',
      headers: { authorization: 'Bearer token' },
    })

    expect(response.statusCode).toBe(200)
    expect(getWorkflowRunView).toHaveBeenCalledTimes(1)
    expect(getWorkflowRunView.mock.calls[0][0]).toEqual({
      workflowRunId: { value: 'run-2' },
      afterId: { value: 'message-42' },
    })
  })
})
