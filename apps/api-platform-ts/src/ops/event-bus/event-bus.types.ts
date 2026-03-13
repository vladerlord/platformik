export type EventBusState = {
  ready: boolean
  error: Error | null
}

export type EventBusMessage = {
  topic: string
  streamId: string
  fields: string[]
}

export type EventBusSubscription = {
  topics: Set<string>
  handler: (message: EventBusMessage) => void
}

export type EventBusListener = {
  isReady(): boolean
  subscribe(topics: string[], handler: (message: EventBusMessage) => void): () => void
  onStateChange(handler: (state: EventBusState) => void): () => void
  close(): Promise<void>
}
