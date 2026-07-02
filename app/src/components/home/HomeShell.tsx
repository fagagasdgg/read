import { useState } from 'react'
import { BookshelfScreen } from '../bookshelf/BookshelfScreen'
import { NotesScreen } from '../notes/NotesScreen'
import { AppSettingsScreen } from '../settings/AppSettingsScreen'

export type HomeTab = 'bookshelf' | 'notes' | 'settings'

interface HomeShellProps {
  onOpenBook: (bookId: string) => void
}

export function HomeShell({ onOpenBook }: HomeShellProps) {
  const [tab, setTab] = useState<HomeTab>('bookshelf')

  return (
    <div className="home-shell" data-tab={tab}>
      <div className="home-panels-viewport">
        <div className="home-panels-track">
          <section className="home-panel" aria-hidden={tab !== 'bookshelf'}>
            <BookshelfScreen onOpenBook={onOpenBook} />
          </section>
          <section className="home-panel" aria-hidden={tab !== 'notes'}>
            <NotesScreen />
          </section>
          <section className="home-panel" aria-hidden={tab !== 'settings'}>
            <AppSettingsScreen />
          </section>
        </div>
      </div>

      <nav className="home-tab-bar" aria-label="主导航">
        <button
          type="button"
          className={`home-tab-btn${tab === 'bookshelf' ? ' active' : ''}`}
          onClick={() => setTab('bookshelf')}
        >
          <span className="home-tab-icon" aria-hidden>
            📚
          </span>
          <span>书架</span>
        </button>
        <button
          type="button"
          className={`home-tab-btn${tab === 'notes' ? ' active' : ''}`}
          onClick={() => setTab('notes')}
        >
          <span className="home-tab-icon" aria-hidden>
            📝
          </span>
          <span>笔记</span>
        </button>
        <button
          type="button"
          className={`home-tab-btn${tab === 'settings' ? ' active' : ''}`}
          onClick={() => setTab('settings')}
        >
          <span className="home-tab-icon" aria-hidden>
            ⚙️
          </span>
          <span>设置</span>
        </button>
      </nav>
    </div>
  )
}
