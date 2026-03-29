import { describe, expect, it } from 'vitest'
import { createSemanticColors } from './semantic-colors'
import type { ThemeTokens } from './themes/tokens'

describe('createSemanticColors', () => {
  it('maps every semantic slot from theme tokens', () => {
    const tokens: ThemeTokens = {
      text: {
        primary: 'white',
        secondary: 'gray',
        muted: 'magenta',
        accent: 'cyan',
      },
      status: {
        success: 'green',
        warning: 'yellow',
        error: 'red',
        info: 'blue',
      },
      border: {
        default: 'cyan',
        muted: 'gray',
      },
    }

    expect(createSemanticColors(tokens)).toEqual({
      text: {
        primary: 'white',
        secondary: 'gray',
        muted: 'magenta',
        accent: 'cyan',
      },
      status: {
        success: 'green',
        warning: 'yellow',
        error: 'red',
        info: 'blue',
      },
      border: {
        default: 'cyan',
        muted: 'gray',
      },
    })
  })
})
