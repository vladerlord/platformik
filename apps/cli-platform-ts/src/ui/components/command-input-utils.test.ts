import { describe, expect, it } from 'vitest'
import {
  commonPrefix,
  findWordEnd,
  findWordStart,
  getCommandSuggestions,
  isPrintableInput,
} from './command-input-utils'

describe('command-input-utils', () => {
  it('finds word boundaries around cursor', () => {
    const input = '/start workflow-id now'

    expect(findWordStart(input, 14)).toBe(7)
    expect(findWordEnd(input, 7)).toBe(18)
  })

  it('computes common prefix for command completion', () => {
    expect(commonPrefix(['/start', '/status', '/stack'])).toBe('/sta')
    expect(commonPrefix([])).toBe('')
  })

  it('filters printable input and rejects control chars', () => {
    expect(isPrintableInput('a')).toBe(true)
    expect(isPrintableInput('\u0000')).toBe(false)
    expect(isPrintableInput('')).toBe(false)
  })

  it('returns suggestions only for first slash-prefixed token', () => {
    expect(getCommandSuggestions('/st', 3).map((item) => item.command)).toEqual(['/start'])
    expect(getCommandSuggestions('hello /st', 9)).toEqual([])
  })
})
