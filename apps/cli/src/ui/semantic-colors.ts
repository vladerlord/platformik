import { darkTokens, type ColorToken, type ThemeTokens } from './themes/tokens'

export type SemanticColors = {
  text: {
    primary: ColorToken
    secondary: ColorToken
    muted: ColorToken
    accent: ColorToken
  }
  status: {
    success: ColorToken
    warning: ColorToken
    error: ColorToken
    info: ColorToken
  }
  border: {
    default: ColorToken
    muted: ColorToken
  }
}

export function createSemanticColors(tokens: ThemeTokens): SemanticColors {
  return {
    text: {
      primary: tokens.text.primary,
      secondary: tokens.text.secondary,
      muted: tokens.text.muted,
      accent: tokens.text.accent,
    },
    status: {
      success: tokens.status.success,
      warning: tokens.status.warning,
      error: tokens.status.error,
      info: tokens.status.info,
    },
    border: {
      default: tokens.border.default,
      muted: tokens.border.muted,
    },
  }
}

export const semanticColors = createSemanticColors(darkTokens)
