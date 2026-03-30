import { Text } from 'ink'
import Spinner from 'ink-spinner'
import { semanticColors } from '../../semantic-colors'

type Variant = 'success' | 'warning' | 'error' | 'info' | 'muted'

type Props = {
  text: string
  variant?: Variant
  spinner?: boolean
}

function variantColor(variant: Variant) {
  switch (variant) {
    case 'success':
      return semanticColors.status.success
    case 'warning':
      return semanticColors.status.warning
    case 'error':
      return semanticColors.status.error
    case 'info':
      return semanticColors.status.info
    case 'muted':
      return semanticColors.text.muted
  }
}

export function StatusLine({ text, variant = 'muted', spinner = false }: Props) {
  return (
    <Text color={variantColor(variant)}>
      {spinner ? <Spinner type="dots" /> : null}
      {spinner ? ' ' : ''}
      {text}
    </Text>
  )
}
