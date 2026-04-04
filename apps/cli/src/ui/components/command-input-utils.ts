export const commandDefinitions = [
  { command: '/workflows', description: 'list available workflows' },
  { command: '/start <id>', description: 'start workflow by id' },
  { command: '/attach <run-id>', description: 'attach to existing run' },
]

export const knownCommands = commandDefinitions.map((item) => item.command.split(' ')[0] ?? item.command)

export function findWordStart(text: string, cursor: number): number {
  let next = cursor

  while (next > 0 && text[next - 1] === ' ') {
    next -= 1
  }
  while (next > 0 && text[next - 1] !== ' ') {
    next -= 1
  }

  return next
}

export function findWordEnd(text: string, cursor: number): number {
  let next = cursor

  while (next < text.length && text[next] === ' ') {
    next += 1
  }
  while (next < text.length && text[next] !== ' ') {
    next += 1
  }

  return next
}

export function commonPrefix(values: string[]): string {
  if (values.length === 0) {
    return ''
  }

  let prefix = values[0] ?? ''
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index] ?? ''
    while (!value.startsWith(prefix) && prefix.length > 0) {
      prefix = prefix.slice(0, -1)
    }
  }

  return prefix
}

export function isPrintableInput(value: string): boolean {
  if (value.length === 0) {
    return false
  }

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if ((code >= 0 && code <= 31) || code === 127) {
      return false
    }
  }

  return true
}

export function getCommandSuggestions(
  input: string,
  cursor: number,
): Array<{ command: string; description: string; fullCommand: string }> {
  const beforeCursor = input.slice(0, cursor)
  const firstTokenMatch = beforeCursor.match(/^\S*$/)
  if (!firstTokenMatch) {
    return []
  }

  const token = firstTokenMatch[0] ?? ''
  if (!token.startsWith('/')) {
    return []
  }

  if (token.length === 0) {
    return []
  }

  return commandDefinitions
    .filter((item) => (item.command.split(' ')[0] ?? item.command).startsWith(token))
    .map((item) => ({
      command: item.command.split(' ')[0] ?? item.command,
      fullCommand: item.command,
      description: item.description,
    }))
}
