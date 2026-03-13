export type ColorToken = 'white' | 'gray' | 'cyan' | 'yellow' | 'red' | 'green' | 'blue' | 'magenta'

export type ThemeTokens = {
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

export const darkTokens: ThemeTokens = {
  text: {
    primary: 'white',
    secondary: 'gray',
    muted: 'gray',
    accent: 'cyan',
  },
  status: {
    success: 'green',
    warning: 'yellow',
    error: 'red',
    info: 'cyan',
  },
  border: {
    default: 'cyan',
    muted: 'gray',
  },
}
