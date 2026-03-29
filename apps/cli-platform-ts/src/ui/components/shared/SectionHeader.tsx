import { Box, Text } from 'ink'
import { semanticColors } from '../../semantic-colors'

type Props = {
  title: string
  subtitle?: string
}

export function SectionHeader({ title, subtitle }: Props) {
  return (
    <Box justifyContent="space-between">
      <Text color={semanticColors.text.accent} bold>
        {title}
      </Text>
      {subtitle ? <Text color={semanticColors.text.secondary}>{subtitle}</Text> : null}
    </Box>
  )
}
