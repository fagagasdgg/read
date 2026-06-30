import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type EpubBook,
  loadChapterHtml,
  loadEpubFromDevice,
  loadProgress,
  saveProgress,
  touchBookLastRead,
} from '../../services/epub'
import {
  getThemeById,
  loadReadingSettings,
  type ReadingSettings,
} from '../../services/settings/readingSettings'
import { ChapterContent } from './ChapterContent'
import { ReaderControlPanel } from './ReaderControlPanel'
import { ReadingSettingsPanel } from './ReadingSettingsPanel'
import { TocPanel } from './TocPanel'
import { WordDetailPopup, type WordLookupRequest } from './WordDetailPopup'

type ReaderOverlay = 'control' | 'toc' | 'settings' | null

interface ReaderScreenProps {
  bookId: string
  onExit: () => void
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

export function ReaderScreen({ bookId, onExit }: ReaderScreenProps) {
  const [book, setBook] = useState<EpubBook | null>(null)
  const [chapterIndex, setChapterIndex] = useState(0)
  const [chapterHtml, setChapterHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [wordLookup, setWordLookup] = useState<WordLookupRequest | null>(null)
  const [now, setNow] = useState(() => formatTime(new Date()))
  const [overlay, setOverlay] = useState<ReaderOverlay>(null)
  const [readingSettings, setReadingSettings] = useState<ReadingSettings | null>(null)
  const bodyRef = useRef<HTMLElement>(null)
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const chapter = book?.chapters[chapterIndex]
  const theme = getThemeById(readingSettings?.themeId ?? 'parchment')
  const progressPercent = book
    ? Math.round(((chapterIndex + 1) / book.chapters.length) * 100)
    : 0

  const readerStyle = readingSettings
    ? ({
        '--reader-font-size': `${readingSettings.fontSize}px`,
        '--reader-line-height': String(readingSettings.lineHeight),
        '--reader-bg': theme.background,
        '--reader-text': theme.text,
        '--reader-bar': theme.bar,
      } as React.CSSProperties)
    : undefined

  useEffect(() => {
    const timer = setInterval(() => setNow(formatTime(new Date())), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    void loadReadingSettings().then(setReadingSettings)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    loadEpubFromDevice(bookId)
      .then((parsed) => {
        if (cancelled) return
        const saved = loadProgress(parsed.id)
        const startIndex = saved?.chapterIndex ?? 0
        const safeIndex = Math.min(startIndex, parsed.chapters.length - 1)
        setBook(parsed)
        setChapterIndex(safeIndex)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '无法打开书籍')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [bookId])

  useEffect(() => {
    if (!book) return
    let cancelled = false
    let revokeAssets: (() => void) | undefined

    setLoading(true)
    setError('')

    loadChapterHtml(book, chapterIndex)
      .then((result) => {
        if (cancelled) {
          result.revoke()
          return
        }
        revokeAssets = result.revoke
        setChapterHtml(result.html)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '章节加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    void touchBookLastRead(book.id)
    return () => {
      cancelled = true
      revokeAssets?.()
    }
  }, [book, chapterIndex])

  useEffect(() => {
    if (!book || !chapterHtml || loading) return
    const saved = loadProgress(book.id)
    if (saved?.chapterIndex !== chapterIndex) {
      saveProgress(book.id, chapterIndex, 0)
      return
    }
    const top = saved.scrollTop ?? 0
    if (top <= 0) return
    requestAnimationFrame(() => {
      bodyRef.current?.scrollTo({ top, behavior: 'auto' })
    })
  }, [book, chapterIndex, chapterHtml, loading])

  const persistScroll = useCallback(
    (scrollTop: number) => {
      if (!book) return
      if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current)
      scrollSaveTimer.current = setTimeout(() => {
        saveProgress(book.id, chapterIndex, scrollTop)
      }, 300)
    },
    [book, chapterIndex],
  )

  const handleWordTap = useCallback((rawWord: string) => {
    setWordLookup({ word: rawWord, exactToken: false, seq: Date.now() })
  }, [])

  function goPrev() {
    if (!book || chapterIndex <= 0) return
    saveProgress(book.id, chapterIndex, 0)
    setChapterIndex((i) => i - 1)
    setWordLookup(null)
  }

  function goNext() {
    if (!book || chapterIndex >= book.chapters.length - 1) return
    saveProgress(book.id, chapterIndex, 0)
    setChapterIndex((i) => i + 1)
    setWordLookup(null)
  }

  function exitBook() {
    if (book && bodyRef.current) {
      saveProgress(book.id, chapterIndex, bodyRef.current.scrollTop)
    }
    setOverlay(null)
    setWordLookup(null)
    onExit()
  }

  function selectChapter(index: number) {
    if (!book) return
    saveProgress(book.id, chapterIndex, bodyRef.current?.scrollTop ?? 0)
    setChapterIndex(index)
    setWordLookup(null)
  }

  if (!book && loading) {
    return (
      <div className="reader-screen reader-screen-loading">
        <p className="reader-status">正在打开书籍…</p>
      </div>
    )
  }

  if (!book) {
    return (
      <div className="reader-screen reader-screen-loading">
        <p className="error">{error || '书籍加载失败'}</p>
        <button type="button" onClick={onExit}>
          返回书架
        </button>
      </div>
    )
  }

  return (
    <div className="reader-screen" style={readerStyle}>
      <header className="reader-top-bar">
        <span className="reader-chapter-name">{chapter?.title ?? ''}</span>
      </header>

      <main
        ref={bodyRef}
        className="reader-body"
        onScroll={(e) => persistScroll(e.currentTarget.scrollTop)}
      >
        {loading && <p className="reader-status">加载章节中…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && chapterHtml && (
          <ChapterContent html={chapterHtml} onWordTap={handleWordTap} />
        )}
      </main>

      <footer className="reader-meta">
        <span>{progressPercent}%</span>
        <span>{now}</span>
      </footer>

      <nav className="reader-bottom-nav">
        <button type="button" onClick={goPrev} disabled={chapterIndex <= 0}>
          ← 上一页
        </button>
        <button
          type="button"
          className="reader-home-btn"
          onClick={() => setOverlay('control')}
          title="阅读控制面板"
        >
          ⌂
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={chapterIndex >= book.chapters.length - 1}
        >
          下一页 →
        </button>
      </nav>

      {overlay === 'control' && (
        <ReaderControlPanel
          bookTitle={book.title}
          onClose={() => setOverlay(null)}
          onExit={exitBook}
          onOpenToc={() => setOverlay('toc')}
          onOpenSettings={() => setOverlay('settings')}
        />
      )}

      {overlay === 'toc' && (
        <TocPanel
          chapters={book.chapters}
          currentIndex={chapterIndex}
          onClose={() => setOverlay(null)}
          onSelectChapter={selectChapter}
        />
      )}

      {overlay === 'settings' && readingSettings && (
        <ReadingSettingsPanel
          settings={readingSettings}
          onChange={setReadingSettings}
          onClose={() => setOverlay(null)}
        />
      )}

      <WordDetailPopup
        lookup={wordLookup}
        onClose={() => setWordLookup(null)}
        onLookupVariant={(word) =>
          setWordLookup({ word, exactToken: true, seq: Date.now() })
        }
      />
    </div>
  )
}
