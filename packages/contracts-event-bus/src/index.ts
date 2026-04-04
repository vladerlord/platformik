import { z } from 'zod'

export const workflowEventTopics = [
  'workflow.run.started',
  'workflow.message.created',
  'workflow.answer.received',
  'workflow.run.completed',
  'workflow.run.failed',
] as const

export const workflowEventTopicSchema = z.enum(workflowEventTopics)
export type WorkflowEventTopic = z.infer<typeof workflowEventTopicSchema>

export const workflowEventPayloadSchema = z.record(z.string(), z.unknown())
export type WorkflowEventPayload = z.infer<typeof workflowEventPayloadSchema>

export const workflowEventEnvelopeSchema = z.object({
  topic: workflowEventTopicSchema,
  payload: workflowEventPayloadSchema,
})
export type WorkflowEventEnvelope = z.infer<typeof workflowEventEnvelopeSchema>

export const workflowEventSubjectPattern = 'workflow.>'

export const isWorkflowEventTopic = (topic: string): topic is WorkflowEventTopic =>
  workflowEventTopicSchema.safeParse(topic).success
