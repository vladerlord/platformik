import type { EventBusMessage, EventBusSubscription } from './event-bus.types'

export const nextTopics = (subscriptions: Set<EventBusSubscription>): string[] => {
  const topics = new Set<string>()

  for (const subscription of subscriptions) {
    for (const topic of subscription.topics) {
      topics.add(topic)
    }
  }

  return [...topics]
}

export const ensureTopicCursors = (topics: string[], cursorByTopic: Map<string, string>): void => {
  for (const topic of topics) {
    if (!cursorByTopic.has(topic)) {
      cursorByTopic.set(topic, '$')
    }
  }
}

export const updateCursor = (cursorByTopic: Map<string, string>, topic: string, streamId: string): void => {
  cursorByTopic.set(topic, streamId)
}

export const dispatchSubscriptions = (
  subscriptions: Set<EventBusSubscription>,
  message: EventBusMessage,
): void => {
  for (const subscription of subscriptions) {
    if (!subscription.topics.has(message.topic)) {
      continue
    }

    subscription.handler(message)
  }
}
