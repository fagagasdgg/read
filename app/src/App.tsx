import { useEffect, useState } from 'react'
import { AppShellThemeProvider } from './contexts/AppShellThemeContext'
import { HomeShell } from './components/home/HomeShell'
import { ReaderScreen } from './components/reader/ReaderScreen'
import { DictDebugPage } from './pages/DictDebugPage'
import { DEFAULT_APP_SHELL_THEME, type AppShellThemeId } from './services/settings/appShellTheme'
import { loadUserSettings } from './services/settings/userSettings'
import './App.css'

type AppView = 'home' | 'reading' | 'dict-debug'

function App() {
  const [view, setView] = useState<AppView>('home')
  const [readingBookId, setReadingBookId] = useState<string | null>(null)
  const [devTapCount, setDevTapCount] = useState(0)
  const [appShellThemeId, setAppShellThemeId] = useState<AppShellThemeId>(DEFAULT_APP_SHELL_THEME)

  useEffect(() => {
    void loadUserSettings().then((settings) => {
      setAppShellThemeId(settings.appShellThemeId)
    })
  }, [])

  function openBook(bookId: string) {
    setReadingBookId(bookId)
    setView('reading')
  }

  function exitBook() {
    setReadingBookId(null)
    setView('home')
  }

  if (view === 'reading' && readingBookId) {
    return <ReaderScreen bookId={readingBookId} onExit={exitBook} />
  }

  if (view === 'dict-debug' && import.meta.env.DEV) {
    return (
      <main className="app-shell dev-only">
        <header className="dev-header">
          <button type="button" onClick={() => setView('home')}>
            ← 返回书架
          </button>
          <span>词典联调（仅开发环境）</span>
        </header>
        <DictDebugPage />
      </main>
    )
  }

  return (
    <AppShellThemeProvider themeId={appShellThemeId} setThemeId={setAppShellThemeId}>
      <main className="app-shell bookshelf-app" data-app-theme={appShellThemeId}>
        <HomeShell onOpenBook={openBook} />
        {import.meta.env.DEV && (
          <button
            type="button"
            className="dev-entry"
            onClick={() => {
              const next = devTapCount + 1
              setDevTapCount(next)
              if (next >= 5) {
                setDevTapCount(0)
                setView('dict-debug')
              }
            }}
            aria-hidden
          />
        )}
      </main>
    </AppShellThemeProvider>
  )
}

export default App
