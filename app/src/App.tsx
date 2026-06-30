import { useState } from 'react'
import { BookshelfScreen } from './components/bookshelf/BookshelfScreen'
import { ReaderScreen } from './components/reader/ReaderScreen'
import { DictDebugPage } from './pages/DictDebugPage'
import './App.css'

type AppView = 'bookshelf' | 'reading' | 'dict-debug'

function App() {
  const [view, setView] = useState<AppView>('bookshelf')
  const [readingBookId, setReadingBookId] = useState<string | null>(null)
  const [devTapCount, setDevTapCount] = useState(0)

  function openBook(bookId: string) {
    setReadingBookId(bookId)
    setView('reading')
  }

  function exitBook() {
    setReadingBookId(null)
    setView('bookshelf')
  }

  if (view === 'reading' && readingBookId) {
    return <ReaderScreen bookId={readingBookId} onExit={exitBook} />
  }

  if (view === 'dict-debug' && import.meta.env.DEV) {
    return (
      <main className="app-shell dev-only">
        <header className="dev-header">
          <button type="button" onClick={() => setView('bookshelf')}>
            ← 返回书架
          </button>
          <span>词典联调（仅开发环境）</span>
        </header>
        <DictDebugPage />
      </main>
    )
  }

  return (
    <main className="app-shell bookshelf-app">
      <BookshelfScreen
        onOpenBook={openBook}
      />
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
  )
}

export default App
