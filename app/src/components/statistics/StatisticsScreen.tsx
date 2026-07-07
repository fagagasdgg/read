import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { BACKUP_DATA_CHANGED } from '../../services/backup/events'
import { getBookCoverDataUrl } from '../../services/epub/library'
import { getDictionaryCacheStats } from '../../services/dictionary'
import { countNotebookEntries, listNotebooks } from '../../services/notes/notebooks'
import { NOTEBOOK_DATA_CHANGED } from '../../services/notes/events'
import {
  currentPeriodResetLabel,
  formatCompareText,
  formatReadingDuration,
  getReadingHistoryStats,
  isCurrentReadingPeriod,
  shiftReadingPeriod,
  type PeriodMode,
  type ReadingBookRank,
  type ReadingHistoryStats,
} from '../../services/reading/readingTime'
import { getMasteredWordCount, subscribeMasteredWords } from '../../services/words/mastered'
import { getLemmaPhraseWordCount } from '../../services/words/phrases'

const PERIOD_TABS: Array<{ id: PeriodMode; label: string }> = [
  { id: 'week', label: '周' },
  { id: 'month', label: '月' },
  { id: 'year', label: '年' },
]

const LONGEST_COLLAPSED_COUNT = 3
const LONGEST_PAGE_SIZE = 10

function DigitBoxes({ value, pad = 2 }: { value: number; pad?: number }) {
  const text = String(value).padStart(pad, '0')
  return (
    <span className="yueli-digits">
      {text.split('').map((digit, index) => (
        <span key={`${digit}-${index}`} className="yueli-digit-box">
          {digit}
        </span>
      ))}
    </span>
  )
}

function CollapsibleSection({
  title,
  summary,
  expanded,
  onToggle,
  children,
}: {
  title: string
  summary: string
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className={`stats-section${expanded ? ' stats-section-expanded' : ''}`}>
      <button type="button" className="stats-section-header" onClick={onToggle}>
        <div className="stats-section-heading">
          <h3>{title}</h3>
          <p className="stats-section-summary">{summary}</p>
        </div>
        <span className="stats-section-chevron" aria-hidden>
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && (
        <div className="stats-section-body">
          {children}
          <button type="button" className="stats-section-collapse" onClick={onToggle}>
            收起
          </button>
        </div>
      )}
    </section>
  )
}

function LongestBookRow({
  book,
  coverUrl,
}: {
  book: ReadingBookRank
  coverUrl: string | null
}) {
  return (
    <div className="yueli-longest">
      <div
        className="yueli-longest-cover"
        style={
          coverUrl ? undefined : { background: 'linear-gradient(145deg, #c4a882, #8f6238)' }
        }
      >
        {coverUrl ? <img src={coverUrl} alt={book.title} /> : <span aria-hidden>📖</span>}
      </div>
      <div className="yueli-longest-meta">
        <p className="yueli-longest-time">
          {formatReadingDuration(book.totalMs)}
          <span className="yueli-longest-chevron">›</span>
        </p>
        <p className="yueli-longest-title">{book.title}</p>
      </div>
    </div>
  )
}

function LongestBooksSection({ books }: { books: ReadingBookRank[] }) {
  const [expanded, setExpanded] = useState(false)
  const [page, setPage] = useState(1)
  const [covers, setCovers] = useState<Record<string, string>>({})

  useEffect(() => {
    setExpanded(false)
    setPage(1)
  }, [books])

  const visibleBooks = useMemo(() => {
    if (!expanded) return books.slice(0, LONGEST_COLLAPSED_COUNT)
    const start = (page - 1) * LONGEST_PAGE_SIZE
    return books.slice(start, start + LONGEST_PAGE_SIZE)
  }, [books, expanded, page])

  const totalPages = Math.max(1, Math.ceil(books.length / LONGEST_PAGE_SIZE))
  const canExpand = books.length > LONGEST_COLLAPSED_COUNT

  useEffect(() => {
    let cancelled = false

    async function loadCovers() {
      const pairs = await Promise.all(
        visibleBooks.map(async (book) => {
          const url = await getBookCoverDataUrl(book.bookId)
          return [book.bookId, url] as const
        }),
      )
      if (cancelled) return
      setCovers((prev) => {
        const next = { ...prev }
        for (const [id, url] of pairs) {
          if (url) next[id] = url
        }
        return next
      })
    }

    void loadCovers()
    return () => {
      cancelled = true
    }
  }, [visibleBooks])

  if (books.length === 0) {
    return <p className="yueli-empty">本周期暂无阅读记录</p>
  }

  return (
    <div className="yueli-longest-section">
      <div className="yueli-longest-list">
        {visibleBooks.map((book) => (
          <LongestBookRow key={book.bookId} book={book} coverUrl={covers[book.bookId] ?? null} />
        ))}
      </div>

      {canExpand && !expanded && (
        <button
          type="button"
          className="yueli-longest-more-btn"
          onClick={() => {
            setExpanded(true)
            setPage(1)
          }}
        >
          展示更多（共 {books.length} 本）
        </button>
      )}

      {expanded && (
        <>
          {totalPages > 1 && (
            <div className="yueli-longest-pager">
              <button
                type="button"
                className="yueli-longest-pager-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </button>
              <span className="yueli-longest-pager-meta">
                第 {page} / {totalPages} 页
              </span>
              <button
                type="button"
                className="yueli-longest-pager-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
              </button>
            </div>
          )}
          <button
            type="button"
            className="yueli-longest-collapse-btn"
            onClick={() => {
              setExpanded(false)
              setPage(1)
            }}
          >
            收起
          </button>
        </>
      )}
    </div>
  )
}

interface StatisticsScreenProps {
  isActive?: boolean
}

export function StatisticsScreen({ isActive = true }: StatisticsScreenProps) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const [history, setHistory] = useState<ReadingHistoryStats | null>(null)
  const [vocabExpanded, setVocabExpanded] = useState(false)
  const [cacheStats, setCacheStats] = useState({ wordCount: 0, notFoundCount: 0 })
  const [masteredCount, setMasteredCount] = useState(0)
  const [phraseWordCount, setPhraseWordCount] = useState(0)
  const [notebookCount, setNotebookCount] = useState(0)
  const [noteEntryCount, setNoteEntryCount] = useState(0)
  const [activeBar, setActiveBar] = useState<number | null>(null)

  const resetToCurrentPeriod = useCallback(() => {
    setAnchor(new Date())
    setActiveBar(null)
  }, [])

  useEffect(() => {
    if (isActive) {
      resetToCurrentPeriod()
    }
  }, [isActive, resetToCurrentPeriod])

  useEffect(() => {
    resetToCurrentPeriod()
  }, [periodMode, resetToCurrentPeriod])

  const refresh = useCallback(async () => {
    const [hist, cache, mastered, phraseWords, notebooks, entryCount] = await Promise.all([
      getReadingHistoryStats(periodMode, anchor),
      getDictionaryCacheStats(),
      getMasteredWordCount(),
      getLemmaPhraseWordCount(),
      listNotebooks(),
      countNotebookEntries(),
    ])
    setHistory(hist)
    setCacheStats(cache)
    setMasteredCount(mastered)
    setPhraseWordCount(phraseWords)
    setNotebookCount(notebooks.length)
    setNoteEntryCount(entryCount)
    setActiveBar(null)
  }, [anchor, periodMode])

  useEffect(() => {
    void refresh()
    const unsub = subscribeMasteredWords(() => {
      void getMasteredWordCount().then(setMasteredCount)
    })
    const onBackup = () => {
      void refresh()
    }
    const onNotebookChanged = () => {
      void refresh()
    }
    window.addEventListener(BACKUP_DATA_CHANGED, onBackup)
    window.addEventListener(NOTEBOOK_DATA_CHANGED, onNotebookChanged)
    return () => {
      unsub()
      window.removeEventListener(BACKUP_DATA_CHANGED, onBackup)
      window.removeEventListener(NOTEBOOK_DATA_CHANGED, onNotebookChanged)
    }
  }, [refresh])

  const showResetPeriod = !isCurrentReadingPeriod(periodMode, anchor)
  const vocabSummary = `词条 ${cacheStats.wordCount} · 笔记本 ${notebookCount} 本 · 笔记 ${noteEntryCount} 条`
  const chartMaxLabel =
    history && history.distributionMaxMs > 0
      ? formatReadingDuration(history.distributionMaxMs)
      : '0 分钟'

  return (
    <div className="statistics-screen yueli-screen">
      <header className="yueli-header">
        <div className="yueli-header-top">
          <h1>阅历</h1>
          <div className="yueli-period-tabs" role="tablist" aria-label="统计周期">
            {PERIOD_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={periodMode === tab.id}
                className={`yueli-period-tab${periodMode === tab.id ? ' active' : ''}`}
                onClick={() => setPeriodMode(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="yueli-period-nav">
          <button
            type="button"
            className="yueli-period-arrow"
            aria-label="上一周期"
            onClick={() => setAnchor((d) => shiftReadingPeriod(periodMode, d, -1))}
          >
            ◀
          </button>
          <span className="yueli-period-label">{history?.periodLabel ?? '…'}</span>
          <button
            type="button"
            className="yueli-period-arrow"
            aria-label="下一周期"
            onClick={() => setAnchor((d) => shiftReadingPeriod(periodMode, d, 1))}
          >
            ▶
          </button>
        </div>

        {showResetPeriod && (
          <button type="button" className="yueli-reset-period-btn" onClick={resetToCurrentPeriod}>
            {currentPeriodResetLabel(periodMode)}
          </button>
        )}
      </header>

      <div className="statistics-body yueli-body">
        <section className="yueli-hero-card">
          <div className="yueli-hero-time">
            {history && history.hours > 0 && (
              <>
                <DigitBoxes value={history.hours} />
                <span className="yueli-time-unit">小时</span>
              </>
            )}
            <DigitBoxes value={history?.minutes ?? 0} pad={history && history.hours > 0 ? 2 : 2} />
            <span className="yueli-time-unit">分钟</span>
          </div>
          <p className="yueli-compare-text">
            {history ? formatCompareText(history) : '加载中…'}
          </p>

          <div className="yueli-summary-grid">
            <div className="yueli-summary-item">
              <strong>{history?.daysRead ?? 0}</strong>
              <span>天已读</span>
            </div>
            <div className="yueli-summary-item">
              <strong>{history?.booksFinished ?? 0}</strong>
              <span>本读完</span>
            </div>
            <div className="yueli-summary-item">
              <strong>{history?.booksRead ?? 0}</strong>
              <span>本读过</span>
            </div>
            <div className="yueli-summary-item">
              <strong>{history?.noteCount ?? 0}</strong>
              <span>条笔记</span>
            </div>
          </div>
        </section>

        <section className="yueli-card">
          <h3 className="yueli-card-title">阅读分布</h3>
          <div className="yueli-chart-wrap">
            <span className="yueli-chart-max">{chartMaxLabel}</span>
            <div className={`yueli-chart yueli-chart-${periodMode}`}>
              {history?.distribution.map((item, index) => {
                const height =
                  history.distributionMaxMs > 0
                    ? Math.max(4, Math.round((item.ms / history.distributionMaxMs) * 100))
                    : 4
                return (
                  <div key={`${item.dateKey}-${index}`} className="yueli-chart-col">
                    <button
                      type="button"
                      className={`yueli-chart-bar${activeBar === index ? ' active' : ''}`}
                      style={{ height: `${height}%` }}
                      onClick={() => setActiveBar((v) => (v === index ? null : index))}
                      aria-label={`${item.label} ${formatReadingDuration(item.ms)}`}
                    />
                    <span className="yueli-chart-label">{item.label}</span>
                    {activeBar === index && item.tooltip && (
                      <span className="yueli-chart-tip">{item.tooltip}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="yueli-card">
          <h3 className="yueli-card-title">阅读最久</h3>
          <LongestBooksSection books={history?.topBooks ?? []} />
        </section>

        <CollapsibleSection
          title="词汇统计"
          summary={vocabSummary}
          expanded={vocabExpanded}
          onToggle={() => setVocabExpanded((v) => !v)}
        >
          <div className="stats-vocab-grid">
            <div className="stats-vocab-item">
              <span className="stats-vocab-label">已缓存词条</span>
              <strong>{cacheStats.wordCount}</strong>
            </div>
            <div className="stats-vocab-item">
              <span className="stats-vocab-label">查不到已标记</span>
              <strong>{cacheStats.notFoundCount}</strong>
            </div>
            <div className="stats-vocab-item">
              <span className="stats-vocab-label">已掌握单词</span>
              <strong>{masteredCount}</strong>
            </div>
            <div className="stats-vocab-item">
              <span className="stats-vocab-label">已添加词组的单词</span>
              <strong>{phraseWordCount}</strong>
            </div>
            <div className="stats-vocab-item stats-vocab-item-wide">
              <span className="stats-vocab-label">笔记本数量</span>
              <strong>{notebookCount}</strong>
            </div>
            <div className="stats-vocab-item stats-vocab-item-wide">
              <span className="stats-vocab-label">笔记条数</span>
              <strong>{noteEntryCount}</strong>
            </div>
          </div>
          <p className="stats-section-note">
            阅读时长仅在应用前台阅读时累计；切到后台不会计入。跨设备同步阅历数据请使用书架「学习数据备份」导出/导入。
          </p>
        </CollapsibleSection>
      </div>
    </div>
  )
}
