import { createHash } from 'node:crypto'
import { log } from '@temporalio/activity'
import type { WorkflowsModule } from '@platformik/module-workflows-ts/contracts'

function deterministicMessageId(runId: string, sequence: number): string {
  const h = createHash('sha256').update(`${runId}:msg:${sequence}`).digest('hex')

  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

export type ActivityOption = { id: string; label: string }

export function createActivities(module: WorkflowsModule) {
  async function deliverMessage(runId: string, text: string, sequence: number): Promise<string> {
    const runResult = await module.getWorkflowRun(runId)
    if (runResult.isErr()) throw new Error(`Run not found: ${runId}`)
    const run = runResult.value

    if (!run.conversationId) throw new Error(`Run ${runId} has no conversation`)

    const messageResult = await module.insertMessage({
      id: deterministicMessageId(runId, sequence),
      conversationId: run.conversationId,
      runId,
      role: 'system',
      content: { version: 1, type: 'text', content: { text } },
    })
    if (messageResult.isErr()) {
      throw new Error(`Failed to insert message: ${JSON.stringify(messageResult.error)}`)
    }

    const runEventResult = await module.insertRunEvent({
      runId,
      sequence,
      type: 'message_created',
      payload: { messageId: messageResult.value.id, type: 'text' },
    })
    if (runEventResult.isErr()) throw new Error(`Failed to insert run event`)

    const outboxResult = await module.insertEventOutboxEntry({
      topic: 'workflow.message.created',
      payload: { runId, messageId: messageResult.value.id, type: 'text' },
    })
    if (outboxResult.isErr()) throw new Error(`Failed to insert outbox entry`)

    log.info('Message delivered', { runId, messageId: messageResult.value.id })

    return text
  }

  async function presentOptionInput(
    runId: string,
    label: string,
    options: ActivityOption[],
    sequence: number,
  ): Promise<void> {
    const runResult = await module.getWorkflowRun(runId)
    if (runResult.isErr()) throw new Error(`Run not found: ${runId}`)
    const run = runResult.value

    if (!run.conversationId) throw new Error(`Run ${runId} has no conversation`)

    const messageResult = await module.insertMessage({
      id: deterministicMessageId(runId, sequence),
      conversationId: run.conversationId,
      runId,
      role: 'system',
      content: {
        version: 1,
        type: 'option_input',
        content: { label, selection_mode: 'single', options },
      },
    })
    if (messageResult.isErr())
      throw new Error(`Failed to insert option_input message: ${JSON.stringify(messageResult.error)}`)

    const runEventResult = await module.insertRunEvent({
      runId,
      sequence,
      type: 'message_created',
      payload: { messageId: messageResult.value.id, type: 'option_input' },
    })
    if (runEventResult.isErr()) throw new Error(`Failed to insert run event`)

    const outboxResult = await module.insertEventOutboxEntry({
      topic: 'workflow.message.created',
      payload: { runId, messageId: messageResult.value.id, type: 'option_input' },
    })
    if (outboxResult.isErr()) throw new Error(`Failed to insert outbox entry`)

    log.info('Option input presented', { runId, messageId: messageResult.value.id })
  }

  async function completeRun(runId: string, sequence: number): Promise<void> {
    const completeResult = await module.completeWorkflowRun(runId, null)
    if (completeResult.isErr()) throw new Error(`Failed to complete run: ${runId}`)

    const runEventResult = await module.insertRunEvent({
      runId,
      sequence,
      type: 'run_completed',
      payload: { runId },
    })
    if (runEventResult.isErr()) throw new Error(`Failed to insert run_completed event`)

    const outboxResult = await module.insertEventOutboxEntry({
      topic: 'workflow.run.completed',
      payload: { runId },
    })
    if (outboxResult.isErr()) throw new Error(`Failed to insert outbox entry`)

    log.info('Run completed', { runId })
  }

  async function failRun(runId: string, sequence: number, errorMessage: string): Promise<void> {
    const failResult = await module.failWorkflowRun(runId, errorMessage)
    if (failResult.isErr()) throw new Error(`Failed to fail run: ${runId}`)

    const runEventResult = await module.insertRunEvent({
      runId,
      sequence,
      type: 'run_failed',
      payload: { runId, errorMessage },
    })
    if (runEventResult.isErr()) throw new Error(`Failed to insert run_failed event`)

    const outboxResult = await module.insertEventOutboxEntry({
      topic: 'workflow.run.failed',
      payload: { runId, errorMessage },
    })
    if (outboxResult.isErr()) throw new Error(`Failed to insert outbox entry`)

    log.error('Run failed', { runId, errorMessage })
  }

  return { deliverMessage, presentOptionInput, completeRun, failRun }
}
