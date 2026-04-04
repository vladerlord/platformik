export type MessageOption = {
  id: string
  label: string
}

export type TextMessageContent = {
  version: 1
  type: 'text'
  content: { text: string }
}

export type OptionInputMessageContent = {
  version: 1
  type: 'option_input'
  content: {
    label: string
    selection_mode: 'single' | 'multiple'
    options: MessageOption[]
  }
}

export type OptionResponseMessageContent = {
  version: 1
  type: 'option_response'
  content: { selected: MessageOption[] }
}

export type StatusMessageContent = {
  version: 1
  type: 'status'
  content: { text: string }
}

export type ErrorMessageContent = {
  version: 1
  type: 'error'
  content: { text: string }
}

export type MessageContent =
  | TextMessageContent
  | OptionInputMessageContent
  | OptionResponseMessageContent
  | StatusMessageContent
  | ErrorMessageContent

export type MessageRole = 'user' | 'system'
