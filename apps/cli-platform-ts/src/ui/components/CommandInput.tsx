import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { useState, useCallback, useEffect, useRef } from 'react'
import { Box, Text, useInput } from 'ink'
import { semanticColors } from '../semantic-colors'
import {
  commandDefinitions,
  commonPrefix,
  findWordEnd,
  findWordStart,
  getCommandSuggestions,
  isPrintableInput,
  knownCommands,
} from './command-input-utils'

type Props = {
  onSubmitCommand: (command: string) => void
  historyNavigationEnabled: boolean
}

const HISTORY_LIMIT = 1000
const historyDirectoryPath = path.join(homedir(), '.platformik')
const historyFilePath = path.join(historyDirectoryPath, 'history.json')

function normalizeHistoryValue(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

async function loadHistory(): Promise<string[]> {
  try {
    const raw = await readFile(historyFilePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown

    return normalizeHistoryValue(parsed).slice(-HISTORY_LIMIT)
  } catch {
    return []
  }
}

async function saveHistory(history: string[]): Promise<void> {
  const nextHistory = history.slice(-HISTORY_LIMIT)
  const tempFilePath = `${historyFilePath}.tmp`

  await mkdir(historyDirectoryPath, { recursive: true })
  await writeFile(tempFilePath, JSON.stringify(nextHistory, null, 2), 'utf8')
  await rename(tempFilePath, historyFilePath)
}

function appendHistoryCommand(history: string[], command: string): string[] {
  if (history[history.length - 1] === command) {
    return history
  }

  return [...history, command].slice(-HISTORY_LIMIT)
}

export function CommandInput({ onSubmitCommand, historyNavigationEnabled }: Props) {
  const [input, setInput] = useState('')
  const [cursor, setCursor] = useState(0)
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const [completionHint, setCompletionHint] = useState('')
  const draftBeforeHistoryRef = useRef('')
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    void loadHistory().then((storedHistory) => {
      setHistory(storedHistory)
    })
  }, [])

  const persistHistory = useCallback((nextHistory: string[]) => {
    persistQueueRef.current = persistQueueRef.current
      .then(async () => {
        await saveHistory(nextHistory)
      })
      .catch(() => undefined)
  }, [])

  const handleSubmit = useCallback(
    (value: string) => {
      const command = value.trim()
      setInput('')
      setCursor(0)
      setHistoryIndex(null)
      setCompletionHint('')
      draftBeforeHistoryRef.current = ''

      if (!command) {
        return
      }

      setHistory((previousHistory) => {
        const nextHistory = appendHistoryCommand(previousHistory, command)
        persistHistory(nextHistory)

        return nextHistory
      })
      onSubmitCommand(command)
    },
    [onSubmitCommand, persistHistory],
  )

  useInput((keyInput, key) => {
    const isBackspaceKey = key.backspace || keyInput === '\b' || keyInput === '\x7f'
    const isBackwardDeleteKey = isBackspaceKey || key.delete

    if (key.return) {
      handleSubmit(input)

      return
    }

    if (key.ctrl && keyInput === 'a') {
      setCursor(0)

      return
    }

    if (key.ctrl && keyInput === 'e') {
      setCursor(input.length)

      return
    }

    if (key.ctrl && keyInput === 'u') {
      setInput('')
      setCursor(0)
      setHistoryIndex(null)
      setCompletionHint('')

      return
    }

    if (key.ctrl && keyInput === 'w') {
      if (cursor === 0) {
        return
      }

      const start = findWordStart(input, cursor)
      setInput(`${input.slice(0, start)}${input.slice(cursor)}`)
      setCursor(start)
      setHistoryIndex(null)
      setCompletionHint('')

      return
    }

    if (historyNavigationEnabled && key.upArrow) {
      if (history.length === 0) {
        return
      }

      setHistoryIndex((previousIndex) => {
        if (previousIndex === null) {
          draftBeforeHistoryRef.current = input
          const nextIndex = history.length - 1
          const nextValue = history[nextIndex] ?? ''
          setInput(nextValue)
          setCursor(nextValue.length)
          setCompletionHint('')

          return nextIndex
        }

        const nextIndex = Math.max(0, previousIndex - 1)
        const nextValue = history[nextIndex] ?? ''
        setInput(nextValue)
        setCursor(nextValue.length)
        setCompletionHint('')

        return nextIndex
      })

      return
    }

    if (historyNavigationEnabled && key.downArrow) {
      if (history.length === 0) {
        return
      }

      setHistoryIndex((previousIndex) => {
        if (previousIndex === null) {
          return null
        }

        const nextIndex = previousIndex + 1
        if (nextIndex >= history.length) {
          const draftValue = draftBeforeHistoryRef.current
          setInput(draftValue)
          setCursor(draftValue.length)
          setCompletionHint('')

          return null
        }

        const nextValue = history[nextIndex] ?? ''
        setInput(nextValue)
        setCursor(nextValue.length)
        setCompletionHint('')

        return nextIndex
      })

      return
    }

    if (key.leftArrow && key.meta) {
      setCursor((previousCursor) => findWordStart(input, previousCursor))

      return
    }

    if (key.rightArrow && key.meta) {
      setCursor((previousCursor) => findWordEnd(input, previousCursor))

      return
    }

    if ((key.meta && keyInput === 'b') || (key.meta && keyInput === 'B')) {
      setCursor((previousCursor) => findWordStart(input, previousCursor))

      return
    }

    if ((key.meta && keyInput === 'f') || (key.meta && keyInput === 'F')) {
      setCursor((previousCursor) => findWordEnd(input, previousCursor))

      return
    }

    if (key.leftArrow) {
      setCursor((previousCursor) => Math.max(0, previousCursor - 1))

      return
    }

    if (key.rightArrow) {
      setCursor((previousCursor) => Math.min(input.length, previousCursor + 1))

      return
    }

    if (isBackwardDeleteKey && key.meta) {
      if (cursor === 0) {
        return
      }

      const start = findWordStart(input, cursor)
      setInput(`${input.slice(0, start)}${input.slice(cursor)}`)
      setCursor(start)
      setHistoryIndex(null)
      setCompletionHint('')

      return
    }

    if (isBackwardDeleteKey) {
      if (cursor === 0) {
        return
      }

      const nextInput = `${input.slice(0, cursor - 1)}${input.slice(cursor)}`
      setInput(nextInput)
      setCursor(cursor - 1)
      setHistoryIndex(null)
      setCompletionHint('')

      return
    }

    if (key.ctrl && keyInput === 'd') {
      if (cursor >= input.length) {
        return
      }

      const nextInput = `${input.slice(0, cursor)}${input.slice(cursor + 1)}`
      setInput(nextInput)
      setHistoryIndex(null)
      setCompletionHint('')

      return
    }

    if (key.tab) {
      const beforeCursor = input.slice(0, cursor)
      const afterCursor = input.slice(cursor)
      const firstTokenMatch = beforeCursor.match(/^\S*$/)

      if (!firstTokenMatch) {
        return
      }

      const token = firstTokenMatch[0] ?? ''
      if (!token.startsWith('/')) {
        return
      }

      const matches = knownCommands.filter((command) => command.startsWith(token))
      if (matches.length === 0) {
        return
      }

      const prefix = commonPrefix(matches)
      const fullyCompleted = matches.length === 1 && prefix === matches[0]
      const replacement = fullyCompleted ? `${prefix} ` : prefix
      const nextInput = `${replacement}${afterCursor}`
      setInput(nextInput)
      setCursor(replacement.length)
      setHistoryIndex(null)

      if (matches.length > 1) {
        setCompletionHint(matches.join('  '))
      } else {
        setCompletionHint('')
      }

      return
    }

    if (key.ctrl || key.meta || key.escape) {
      return
    }

    if (isPrintableInput(keyInput)) {
      const nextInput = `${input.slice(0, cursor)}${keyInput}${input.slice(cursor)}`
      setInput(nextInput)
      setCursor(cursor + keyInput.length)
      setHistoryIndex(null)
      setCompletionHint('')
    }
  })

  const cursorChar = input[cursor] ?? ' '
  const beforeCursor = input.slice(0, cursor)
  const afterCursor = input.slice(cursor + (cursor < input.length ? 1 : 0))
  const liveSuggestions = getCommandSuggestions(input, cursor)

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={semanticColors.text.accent} bold>
          {`>> `}
        </Text>
        <Text color={semanticColors.text.primary}>
          {beforeCursor}
          <Text inverse>{cursorChar}</Text>
          {afterCursor}
        </Text>
      </Box>
      <Text
        color={semanticColors.text.secondary}
      >{`Tab autocomplete | Up/Down history | Ctrl+A/E/W/U/D | Alt+Arrows`}</Text>
      {liveSuggestions.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {liveSuggestions.map((suggestion, index) => (
            <Box key={suggestion.fullCommand}>
              <Box width={20}>
                <Text
                  color={index === 0 ? semanticColors.text.accent : semanticColors.text.primary}
                  bold={index === 0}
                >
                  {suggestion.fullCommand}
                </Text>
              </Box>
              <Text color={index === 0 ? semanticColors.text.accent : semanticColors.text.secondary}>
                {suggestion.description}
              </Text>
            </Box>
          ))}
        </Box>
      ) : null}
      {completionHint ? <Text color={semanticColors.text.secondary}>{completionHint}</Text> : null}
      {historyIndex !== null ? (
        <Text color={semanticColors.text.secondary}>{`history ${historyIndex + 1}/${history.length}`}</Text>
      ) : null}
    </Box>
  )
}

export function ReplHelp() {
  return (
    <Box flexDirection="column">
      <Text color={semanticColors.text.secondary}>{`Commands:`}</Text>
      {commandDefinitions.map((definition) => (
        <Text key={definition.command}>
          <Text color={semanticColors.text.accent}>{definition.command}</Text>
          {` ${definition.description}`}
        </Text>
      ))}
      <Text color={semanticColors.text.secondary}>{`Press Esc for REPL, Ctrl+C to exit.`}</Text>
    </Box>
  )
}
