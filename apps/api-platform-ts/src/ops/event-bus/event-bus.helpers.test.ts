import { describe, expect, test, vi } from 'vitest'
import type { EventBusSubscription } from './event-bus.types'
import { dispatchSubscriptions, ensureTopicCursors, nextTopics, updateCursor } from './event-bus.helpers'

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

  test('ensures cursor defaults for unseen topics', () => {
    const cursorByTopic = new Map<string, string>([['existing', '1-1']])

    ensureTopicCursors(['existing', 'new-topic'], cursorByTopic)

    expect(cursorByTopic).toEqual(
      new Map([
        ['existing', '1-1'],
        ['new-topic', '$'],
      ]),
    )
  })

  test('updates cursor for topic', () => {
    const cursorByTopic = new Map<string, string>()

    updateCursor(cursorByTopic, 'workflow.updated', '42-0')

    expect(cursorByTopic.get('workflow.updated')).toBe('42-0')
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
      streamId: '7-1',
      fields: ['payload', '{}'],
    })

    expect(matchingHandler).toHaveBeenCalledTimes(1)
    expect(otherHandler).not.toHaveBeenCalled()
  })
})
