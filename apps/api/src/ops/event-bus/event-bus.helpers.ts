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
