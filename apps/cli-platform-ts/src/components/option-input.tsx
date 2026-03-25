import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import type { PendingInput } from '../api/client'

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
      <Text color="yellow">{`? ${label}`}</Text>
      <SelectInput items={items} onSelect={(item) => onSubmit(item.value)} />
    </Box>
  )
}
