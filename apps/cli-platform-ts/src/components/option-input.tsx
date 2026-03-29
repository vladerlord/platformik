import { Box, Text } from 'ink'
import type { PendingInput } from '../api/client'
import { BaseSelectionList } from '../ui/components/shared/BaseSelectionList'
import { semanticColors } from '../ui/semantic-colors'

type Props = {
  input: PendingInput
  onSubmit: (optionId: string) => void
}

export function OptionInput({ input, onSubmit }: Props) {
  if (!input.optionInput) return null

  const { label, options } = input.optionInput
  const items = options.map((option) => ({ label: option.label, value: option.id }))

  return (
    <Box flexDirection="column">
      <Text color={semanticColors.status.warning}>{`? ${label}`}</Text>
      <BaseSelectionList items={items} onSelect={(item) => onSubmit(item.value)} />
    </Box>
  )
}
