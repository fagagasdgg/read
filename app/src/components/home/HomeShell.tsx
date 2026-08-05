import { startTransition, useState } from 'react'
import { BookshelfScreen } from '../bookshelf/BookshelfScreen'
import { NotesScreen } from '../notes/NotesScreen'
import { AppSettingsScreen } from '../settings/AppSettingsScreen'
import { StatisticsScreen } from '../statistics/StatisticsScreen'
import { ToolsScreen } from '../tools/ToolsScreen'

export type HomeTab = 'bookshelf' | 'notes' | 'statistics' | 'tools' | 'settings'

interface HomeShellProps {
  onOpenBook: (bookId: string) => void
}

export function HomeShell({ onOpenBook }: HomeShellProps) {
  const [tab, setTab] = useState<HomeTab>('bookshelf')
  const [visited, setVisited] = useState<Partial<Record<HomeTab, boolean>>>({
    bookshelf: true,
  })

  function go(next: HomeTab) {
    setVisited((prev) => (prev[next] ? prev : { ...prev, [next]: true }))
    startTransition(() => setTab(next))
  }

  return (
    <div className="home-shell" data-tab={tab}>
      <div className="home-panels-viewport">
        <div className="home-panels-track">
          <section className="home-panel" aria-hidden={tab !== 'bookshelf'}>
            <BookshelfScreen onOpenBook={onOpenBook} />
          </section>
          <section className="home-panel" aria-hidden={tab !== 'notes'}>
            {visited.notes ? <NotesScreen isActive={tab === 'notes'} /> : null}
          </section>
          <section className="home-panel" aria-hidden={tab !== 'statistics'}>
            {visited.statistics ? <StatisticsScreen isActive={tab === 'statistics'} /> : null}
          </section>
          <section className="home-panel" aria-hidden={tab !== 'tools'}>
            {visited.tools ? <ToolsScreen /> : null}
          </section>
          <section className="home-panel" aria-hidden={tab !== 'settings'}>
            {visited.settings ? <AppSettingsScreen /> : null}
          </section>
        </div>
      </div>

      <nav className="home-tab-bar" aria-label="主导航">
        <button
          type="button"
          className={`home-tab-btn${tab === 'bookshelf' ? ' active' : ''}`}
          onClick={() => go('bookshelf')}
        >
          <span className="home-tab-icon" aria-hidden>
            📚
          </span>
          <span>书架</span>
        </button>
        <button
          type="button"
          className={`home-tab-btn${tab === 'notes' ? ' active' : ''}`}
          onClick={() => go('notes')}
        >
          <span className="home-tab-icon" aria-hidden>
            📝
          </span>
          <span>笔记</span>
        </button>
        <button
          type="button"
          className={`home-tab-btn${tab === 'statistics' ? ' active' : ''}`}
          onClick={() => go('statistics')}
        >
          <span className="home-tab-icon" aria-hidden>
            📊
          </span>
          <span>统计</span>
        </button>
        <button
          type="button"
          className={`home-tab-btn${tab === 'tools' ? ' active' : ''}`}
          onClick={() => go('tools')}
        >
          <span className="home-tab-icon" aria-hidden>
            🧰
          </span>
          <span>工具</span>
        </button>
        <button
          type="button"
          className={`home-tab-btn${tab === 'settings' ? ' active' : ''}`}
          onClick={() => go('settings')}
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
