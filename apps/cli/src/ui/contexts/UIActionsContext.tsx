import { createContext, useContext, type ReactNode } from 'react'
import type { UIActions } from '../types'

const UIActionsContext = createContext<UIActions | null>(null)

export function UIActionsProvider({ value, children }: { value: UIActions; children: ReactNode }) {
  return <UIActionsContext.Provider value={value}>{children}</UIActionsContext.Provider>
}

export function useUIActions(): UIActions {
  const context = useContext(UIActionsContext)
  if (!context) {
    throw new Error('useUIActions must be used within UIActionsProvider')
  }

  return context
}
