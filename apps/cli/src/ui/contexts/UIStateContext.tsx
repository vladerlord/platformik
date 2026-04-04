import { createContext, useContext, type ReactNode } from 'react'
import type { UIState } from '../types'

const UIStateContext = createContext<UIState | null>(null)

export function UIStateProvider({ value, children }: { value: UIState; children: ReactNode }) {
  return <UIStateContext.Provider value={value}>{children}</UIStateContext.Provider>
}

export function useUIState(): UIState {
  const context = useContext(UIStateContext)
  if (!context) {
    throw new Error('useUIState must be used within UIStateProvider')
  }

  return context
}
