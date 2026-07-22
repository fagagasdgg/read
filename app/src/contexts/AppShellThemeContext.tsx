import { createContext, useContext, type ReactNode } from 'react'
import type { AppShellThemeId } from '../services/settings/appShellTheme'

interface AppShellThemeContextValue {
  themeId: AppShellThemeId
  setThemeId: (themeId: AppShellThemeId) => void
}

const AppShellThemeContext = createContext<AppShellThemeContextValue | null>(null)

export function AppShellThemeProvider({
  themeId,
  setThemeId,
  children,
}: AppShellThemeContextValue & { children: ReactNode }) {
  return (
    <AppShellThemeContext.Provider value={{ themeId, setThemeId }}>
      {children}
    </AppShellThemeContext.Provider>
  )
}

export function useAppShellTheme(): AppShellThemeContextValue {
  const value = useContext(AppShellThemeContext)
  if (!value) {
    throw new Error('useAppShellTheme must be used within AppShellThemeProvider')
  }
  return value
}
