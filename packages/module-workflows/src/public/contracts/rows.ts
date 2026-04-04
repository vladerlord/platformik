import type { MessageContent, MessageRole } from './messages'

export type ConversationRow = {
  id: string
  userId: string
  createdAt: Date
  updatedAt: Date
}

export type MessageRow = {
  id: string
  conversationId: string
  runId: string
  role: MessageRole
  content: MessageContent
  createdAt: Date
  updatedAt: Date
}

export type NodeRunRow = {
  id: string
  runId: string
  nodeId: string
  status: string
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
}

export type RunEventRow = {
  id: string
  runId: string
  sequence: number
  type: string
  payload: Record<string, unknown>
  createdAt: Date
}

export type EventOutboxRow = {
  id: string
  topic: string
  payload: Record<string, unknown>
  attempts: number
  publishedAt: Date | null
  createdAt: Date
}
