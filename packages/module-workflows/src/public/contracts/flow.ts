export type NodeType = 'start' | 'option_selection' | 'send_message' | 'end'

export type FlowNodeOption = {
  label: string
  nextNodeId: string
}

export type FlowNode = {
  id: string
  type: NodeType
  nextNodeId?: string
  question?: string
  answerKey?: string
  messageTemplate?: string
  options?: FlowNodeOption[]
}

export type FlowDefinition = {
  version: string
  startNodeId: string
  nodes: FlowNode[]
}

export type WorkflowSummary = {
  id: string
  title: string
}
