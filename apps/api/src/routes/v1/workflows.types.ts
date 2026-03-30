import { z as zod } from 'zod'

export const startWorkflowBodySchema = zod.object({
  workflowId: zod.string().min(1),
})

export const submitAnswerBodySchema = zod
  .object({
    optionId: zod.string().min(1).optional(),
    rawInput: zod.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const fieldsCount = Number(Boolean(value.optionId)) + Number(Boolean(value.rawInput))

    if (fieldsCount === 1) {
      return
    }

    ctx.addIssue({
      code: zod.ZodIssueCode.custom,
      message: 'Exactly one of optionId or rawInput is required',
      path: ['optionId'],
    })
  })

export const workflowRunIdParamsSchema = zod.object({
  id: zod.string().min(1),
})

export const workflowRunViewQuerySchema = zod.object({
  afterId: zod.string().min(1).optional(),
})

export const workflowsErrorResponseSchema = zod.object({
  error: zod.object({
    code: zod.string(),
    message: zod.string(),
  }),
})

export const listWorkflowsResponseSchema = zod.object({
  workflows: zod.array(zod.unknown()),
})

export const startWorkflowResponseSchema = zod.object({
  workflowRunId: zod.string().optional(),
  conversationId: zod.string().optional(),
  temporalWorkflowId: zod.string().optional(),
})

export const workflowRunViewResponseSchema = zod.object({
  conversationId: zod.string().nullable(),
  status: zod.string(),
  currentNodeId: zod.string().nullable(),
  revision: zod.number(),
  lastMessageId: zod.string().nullable(),
  messages: zod.array(zod.unknown()),
  pendingInput: zod.unknown().nullable(),
})

export const submitAnswerResponseSchema = zod.object({
  ok: zod.literal(true),
})

export const workflowEventsResponseSchema = zod.any()

export type StartWorkflowBody = zod.infer<typeof startWorkflowBodySchema>
export type SubmitAnswerBody = zod.infer<typeof submitAnswerBodySchema>
export type WorkflowRunIdParams = zod.infer<typeof workflowRunIdParamsSchema>
export type WorkflowRunViewQuery = zod.infer<typeof workflowRunViewQuerySchema>
