import { WorkflowList } from '../components/workflow-list'
import { LoginScreen } from '../components/login-screen'
import { RunView } from '../components/run-view'
import { useUIState } from './contexts/UIStateContext'
import { useUIActions } from './contexts/UIActionsContext'
import { CommandInput, ReplHelp } from './components/CommandInput'
import { DefaultAppLayout } from './layouts/DefaultAppLayout'

function screenTitle(screenType: 'repl' | 'workflows' | 'run', runId: string | null): string {
  if (screenType === 'run') {
    return runId ? `Run: ${runId}` : 'run'
  }

  return screenType
}

export function App() {
  const state = useUIState()
  const actions = useUIActions()

  if (state.screen.type === 'login') {
    return <LoginScreen />
  }

  const title = screenTitle(state.screen.type, state.currentRunId)

  return (
    <DefaultAppLayout
      title="Platformik CLI"
      subtitle={title}
      commandInput={
        <CommandInput
          onSubmitCommand={actions.submitCommand}
          historyNavigationEnabled={state.screen.type !== 'run' || !state.hasRunPendingInput}
        />
      }
    >
      {state.screen.type === 'workflows' ? <WorkflowList /> : null}
      {state.screen.type === 'run' ? <RunView /> : null}
      {state.screen.type === 'repl' ? <ReplHelp /> : null}
    </DefaultAppLayout>
  )
}
