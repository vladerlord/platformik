import {
  condition,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
  workflowInfo,
} from '@temporalio/workflow'
import type {
  FlowDefinition,
  FlowNode,
  FlowNodeOption,
  InteractiveFlowState,
} from '@platformik/module-workflows/contracts'
import type { createActivities } from './activities'

const { deliverMessage, presentOptionInput, completeRun, failRun } = proxyActivities<
  ReturnType<typeof createActivities>
>({
  scheduleToCloseTimeout: '10s',
})

export const submitAnswerSignal = defineSignal<[string]>('submitAnswer')
export const workflowStateQuery = defineQuery<InteractiveFlowState>('workflowState')

function resolveOption(raw: string, node: FlowNode): FlowNodeOption | undefined {
  const options = node.options ?? []
  if (/^\d+$/.test(raw)) {
    const idx = parseInt(raw, 10) - 1
    if (idx >= 0 && idx < options.length) {
      return options[idx]
    }
  } else {
    const found = options.find((opt) => opt.label.toLowerCase() === raw.toLowerCase())
    if (found) return found
  }

  return undefined
}

export async function interactiveDslWorkflow(definition: FlowDefinition): Promise<void> {
  const { workflowId: runId } = workflowInfo()

  // Sequence 1 is reserved for run_started (inserted by the API service handler).
  // Incremented before every use, so the first event in this workflow gets sequence 2.
  let eventSequence = 1

  let pendingQuestion: string | undefined = undefined
  let pendingOptions: string[] = []
  let awaitingAnswerKey: string | undefined = undefined
  const answers: Record<string, string> = {}
  const deliveredMessages: string[] = []
  let completed = false

  setHandler(submitAnswerSignal, (answer: string) => {
    if (awaitingAnswerKey === undefined) return
    answers[awaitingAnswerKey] = answer
  })

  setHandler(
    workflowStateQuery,
    (): InteractiveFlowState => ({
      pendingQuestion,
      pendingOptions,
      deliveredMessages: [...deliveredMessages],
      awaitingAnswer: awaitingAnswerKey !== undefined,
      completed,
    }),
  )

  const nodesById: Record<string, FlowNode> = Object.fromEntries(definition.nodes.map((n) => [n.id, n]))
  let currentNodeId: string | undefined = definition.startNodeId
  const context: Record<string, string> = {}

  try {
    while (currentNodeId !== undefined) {
      const node: FlowNode | undefined = nodesById[currentNodeId]
      if (!node) throw new Error(`Node not found: ${currentNodeId}`)

      if (node.type === 'start') {
        currentNodeId = node.nextNodeId
        continue
      }

      if (node.type === 'option_selection') {
        if (!node.question) throw new Error(`Node ${node.id} is missing question`)
        if (!node.options?.length) throw new Error(`Node ${node.id} has no options`)
        const nodeOptions = node.options
        const answerKey = node.answerKey ?? `${node.id}_selection`

        const activityOptions = nodeOptions.map((option, index) => ({
          id: String(index + 1),
          label: option.label,
        }))
        eventSequence++
        await presentOptionInput(runId, node.question, activityOptions, eventSequence)

        pendingQuestion = node.question
        pendingOptions = nodeOptions.map((option) => option.label)
        awaitingAnswerKey = answerKey

        let selectedOption: FlowNodeOption | undefined = undefined
        while (selectedOption === undefined) {
          await condition(() => answerKey in answers)
          const raw = answers[answerKey] ?? ''
          delete answers[answerKey]
          selectedOption = resolveOption(raw, node)
          if (selectedOption === undefined) {
            const hint = nodeOptions.map((option, index) => `${index + 1}. ${option.label}`).join(', ')
            deliveredMessages.push(`Invalid selection: ${JSON.stringify(raw)}. Choose: ${hint}`)
          } else {
            context[answerKey] = selectedOption.label
          }
        }

        pendingQuestion = undefined
        pendingOptions = []
        awaitingAnswerKey = undefined
        currentNodeId = selectedOption.nextNodeId
        continue
      }

      if (node.type === 'send_message') {
        if (!node.messageTemplate) throw new Error(`Node ${node.id} is missing messageTemplate`)
        const rendered = node.messageTemplate.replace(
          /\{(\w+)\}/g,
          (_match: string, key: string) => context[key] ?? '',
        )
        eventSequence++
        const delivered = await deliverMessage(runId, rendered, eventSequence)
        deliveredMessages.push(delivered)
        currentNodeId = node.nextNodeId
        continue
      }

      if (node.type === 'end') {
        eventSequence++
        await completeRun(runId, eventSequence)
        currentNodeId = undefined
        continue
      }

      throw new Error(`Unsupported node type: ${String(node.type)}`)
    }

    completed = true
  } catch (error) {
    eventSequence++
    const errorMessage = error instanceof Error ? error.message : String(error)
    await failRun(runId, eventSequence, errorMessage)
    throw error
  }
}
