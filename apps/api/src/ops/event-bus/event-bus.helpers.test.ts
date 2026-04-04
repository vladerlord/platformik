import { describe, expect, test, vi } from 'vitest'
import type { EventBusSubscription } from './event-bus.types'
import { dispatchSubscriptions, nextTopics } from './event-bus.helpers'

describe('event-bus helpers', () => {
  test('collects unique topics from subscriptions', () => {
    const subscriptions = new Set<EventBusSubscription>([
      { topics: new Set(['workflow.created', 'workflow.updated']), handler: vi.fn() },
      { topics: new Set(['workflow.updated', 'workflow.completed']), handler: vi.fn() },
    ])

    expect(nextTopics(subscriptions).sort()).toEqual([
      'workflow.completed',
      'workflow.created',
      'workflow.updated',
    ])
  })

  test('dispatches messages only to matching subscribers', () => {
    const matchingHandler = vi.fn()
    const otherHandler = vi.fn()
    const subscriptions = new Set<EventBusSubscription>([
      { topics: new Set(['workflow.updated']), handler: matchingHandler },
      { topics: new Set(['workflow.created']), handler: otherHandler },
    ])

    dispatchSubscriptions(subscriptions, {
      topic: 'workflow.updated',
      sequence: '7',
      payload: {},
    })

    expect(matchingHandler).toHaveBeenCalledTimes(1)
    expect(otherHandler).not.toHaveBeenCalled()
  })
})
