import type { BffClient } from '../api/client'

export type Screen =
  | { type: 'login' }
  | { type: 'repl' }
  | { type: 'workflows' }
  | { type: 'run'; runId: string }

export type UIState = {
  client: BffClient
  email: string
  password: string
  screen: Screen
  hasRunPendingInput: boolean
  currentRunId: string | null
}

export type UIActions = {
  onLoginSuccess: () => void
  navigateToRepl: () => void
  openWorkflows: () => void
  startWorkflow: (workflowId: string) => Promise<void>
  attachToRun: (runId: string) => void
  submitAnswer: (optionId: string) => Promise<void>
  submitCommand: (command: string) => void
  setRunPendingInput: (hasPendingInput: boolean) => void
}
