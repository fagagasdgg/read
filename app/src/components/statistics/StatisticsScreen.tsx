import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { BACKUP_DATA_CHANGED } from '../../services/backup/events'
import { getDictionaryCacheStats } from '../../services/dictionary'
import { listNotebooks } from '../../services/notes/notebooks'
import {
  formatReadingDuration,
  getReadingTimeStats,
  type ReadingTimeStats,
} from '../../services/reading/readingTime'
import { getMasteredWordCount, subscribeMasteredWords } from '../../services/words/mastered'
import { getLemmaPhraseWordCount } from '../../services/words/phrases'

interface CollapsibleSectionProps {
  title: string
  summary: string
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}

function CollapsibleSection({
  title,
  summary,
  expanded,
  onToggle,
  children,
}: CollapsibleSectionProps) {
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

export function StatisticsScreen() {
  const [readingExpanded, setReadingExpanded] = useState(false)
  const [vocabExpanded, setVocabExpanded] = useState(false)
  const [readingStats, setReadingStats] = useState<ReadingTimeStats | null>(null)
  const [cacheStats, setCacheStats] = useState({ wordCount: 0, notFoundCount: 0 })
  const [masteredCount, setMasteredCount] = useState(0)
  const [phraseWordCount, setPhraseWordCount] = useState(0)
  const [notebookCount, setNotebookCount] = useState(0)

  const refresh = useCallback(async () => {
    const [reading, cache, mastered, phraseWords, notebooks] = await Promise.all([
      getReadingTimeStats(),
      getDictionaryCacheStats(),
      getMasteredWordCount(),
      getLemmaPhraseWordCount(),
      listNotebooks(),
    ])
    setReadingStats(reading)
    setCacheStats(cache)
    setMasteredCount(mastered)
    setPhraseWordCount(phraseWords)
    setNotebookCount(notebooks.length)
  }, [])

  useEffect(() => {
    void refresh()
    const unsubMastered = subscribeMasteredWords(() => {
      void getMasteredWordCount().then(setMasteredCount)
    })
    const onBackupChanged = () => {
      void refresh()
    }
    window.addEventListener(BACKUP_DATA_CHANGED, onBackupChanged)
    return () => {
      unsubMastered()
      window.removeEventListener(BACKUP_DATA_CHANGED, onBackupChanged)
    }
  }, [refresh])

  const readingSummary = readingStats
    ? `今日 ${formatReadingDuration(readingStats.todayMs)}`
    : '加载中…'

  const vocabSummary = `词条 ${cacheStats.wordCount} · 笔记本 ${notebookCount} 本`

  return (
    <div className="statistics-screen">
      <header className="statistics-header">
        <h1>统计</h1>
        <p className="statistics-subtitle">阅读与学习数据一览</p>
      </header>

      <div className="statistics-body">
        <CollapsibleSection
          title="阅读时长统计"
          summary={readingSummary}
          expanded={readingExpanded}
          onToggle={() => setReadingExpanded((v) => !v)}
        >
          <div className="stats-metric-grid">
            <div className="stats-metric-card">
              <span className="stats-metric-label">今日</span>
              <strong className="stats-metric-value">
                {formatReadingDuration(readingStats?.todayMs ?? 0)}
              </strong>
            </div>
            <div className="stats-metric-card">
              <span className="stats-metric-label">近 7 天</span>
              <strong className="stats-metric-value">
                {formatReadingDuration(readingStats?.weekMs ?? 0)}
              </strong>
            </div>
            <div className="stats-metric-card stats-metric-card-wide">
              <span className="stats-metric-label">累计</span>
              <strong className="stats-metric-value">
                {formatReadingDuration(readingStats?.totalMs ?? 0)}
              </strong>
            </div>
          </div>

          {readingStats && readingStats.recentDays.length > 0 ? (
            <ul className="stats-day-list">
              {readingStats.recentDays.map((day) => (
                <li key={day.date} className="stats-day-item">
                  <span>{day.date}</span>
                  <span>{formatReadingDuration(day.totalMs)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="stats-empty-hint">开始阅读后，将在此记录每日阅读时长。</p>
          )}
        </CollapsibleSection>

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
          </div>
          <p className="stats-section-note">
            数据来自本地词典缓存与学习记录；可通过书架「数据备份」导入导出。
          </p>
        </CollapsibleSection>
      </div>
    </div>
  )
}
