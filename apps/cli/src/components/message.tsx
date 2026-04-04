import { Text } from 'ink'
import type { ConversationMessage } from '../api/client'
import { semanticColors } from '../ui/semantic-colors'

export function Message({ message }: { message: ConversationMessage }) {
  const content = message.content
  if (!content) return null

  const type = content['type'] as string

  switch (type) {
    case 'text': {
      const inner = content['content'] as Record<string, unknown>
      const prefix = message.role === 'MESSAGE_ROLE_USER' ? 'You: ' : ''

      return <Text color={semanticColors.text.primary}>{`${prefix}${String(inner['text'] ?? '')}`}</Text>
    }

    case 'option_input':
      return null

    case 'option_response': {
      const inner = content['content'] as Record<string, unknown>
      const selected = inner['selected'] as Array<{ id: string; label: string }>

      return (
        <Text
          color={semanticColors.text.accent}
        >{`> ${selected.map((option) => option.label).join(', ')}`}</Text>
      )
    }

    case 'status': {
      const inner = content['content'] as Record<string, unknown>
      const text = inner['text']

      return text ? <Text color={semanticColors.text.secondary}>{`[${String(text)}]`}</Text> : null
    }

    case 'error': {
      const inner = content['content'] as Record<string, unknown>
      const text = inner['text'] ?? inner['message']

      return <Text color={semanticColors.status.error}>{`Error: ${String(text ?? 'Unknown error')}`}</Text>
    }

    default:
      return null
  }
}
