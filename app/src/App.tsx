import { useState } from 'react'
import { ReaderScreen } from './components/reader/ReaderScreen'
import { DictDebugPage } from './pages/DictDebugPage'
import './App.css'

type Tab = 'reader' | 'dict'

function App() {
  const [tab, setTab] = useState<Tab>('reader')

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Read</h1>
        <p>英语 EPUB 阅读器</p>
        <nav className="app-tabs">
          <button
            type="button"
            className={tab === 'reader' ? 'active' : ''}
            onClick={() => setTab('reader')}
          >
            阅读器
          </button>
          <button
            type="button"
            className={tab === 'dict' ? 'active' : ''}
            onClick={() => setTab('dict')}
          >
            词典联调
          </button>
        </nav>
      </header>

      {tab === 'reader' ? <ReaderScreen /> : <DictDebugPage />}
    </main>
  )
}

export default App
