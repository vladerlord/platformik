import type {
  GetWorkflowRunViewRequest,
  SelectOptionAnswer,
  SubmitAnswerRequest,
} from '@platformik/contracts-workflows-ts'
import type { SubmitAnswerBody } from '../../api/v1/workflows.types'

type WorkflowUuid = NonNullable<GetWorkflowRunViewRequest['workflowRunId']>

const toUuid = (value: string): WorkflowUuid => ({ value })

export const buildGetRunViewRequest = (runId: string, afterId?: string): GetWorkflowRunViewRequest => {
  const request: GetWorkflowRunViewRequest = { workflowRunId: toUuid(runId) }

  if (afterId) {
    request.afterId = toUuid(afterId)
  }

  return request
}

export const buildSubmitAnswerRequest = (runId: string, body: SubmitAnswerBody): SubmitAnswerRequest => {
  const selectOption: SelectOptionAnswer = body.optionId
    ? { optionId: body.optionId }
    : { rawInput: body.rawInput }

  return {
    workflowRunId: toUuid(runId),
    selectOption,
  }
}
