import SelectInput from 'ink-select-input'

export type SelectionItem = {
  label: string
  value: string
}

type Props = {
  items: SelectionItem[]
  onSelect: (item: SelectionItem) => void
}

export function BaseSelectionList({ items, onSelect }: Props) {
  return <SelectInput items={items} onSelect={onSelect} />
}
