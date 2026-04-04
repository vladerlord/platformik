import type { ReactNode } from 'react'
import { Box } from 'ink'
import { SectionHeader } from '../components/shared/SectionHeader'
import { semanticColors } from '../semantic-colors'

type Props = {
  title: string
  subtitle: string
  children: ReactNode
  commandInput: ReactNode
}

export function DefaultAppLayout({ title, subtitle, children, commandInput }: Props) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={semanticColors.border.default} paddingX={1}>
      <SectionHeader title={title} subtitle={subtitle} />
      <Box flexDirection="column" marginTop={1}>
        {children}
      </Box>
      <Box marginTop={1} borderStyle="single" borderColor={semanticColors.border.muted} paddingX={1}>
        {commandInput}
      </Box>
    </Box>
  )
}
