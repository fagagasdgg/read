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
import { useChapterPages } from './useChapterPages'
import { WordDetailPopup, type WordLookupRequest } from './WordDetailPopup'

type ReaderOverlay = 'control' | 'toc' | 'settings' | null

type ChapterLandMode = 'start' | 'end' | 'restore'

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
  const [pageIndex, setPageIndex] = useState(0)
  const [chapterHtml, setChapterHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [wordLookup, setWordLookup] = useState<WordLookupRequest | null>(null)
  const [now, setNow] = useState(() => formatTime(new Date()))
  const [overlay, setOverlay] = useState<ReaderOverlay>(null)
  const [readingSettings, setReadingSettings] = useState<ReadingSettings | null>(null)
  const [viewportEl, setViewportEl] = useState<HTMLElement | null>(null)
  const chapterLandRef = useRef<{ mode: ChapterLandMode; page?: number }>({ mode: 'start' })
  const chapterLandAppliedRef = useRef(false)
  const progressSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { pages, paginating } = useChapterPages(chapterHtml, viewportEl, readingSettings)

  const chapter = book?.chapters[chapterIndex]
  const theme = getThemeById(readingSettings?.themeId ?? 'parchment')
  const chapterFraction = pages.length > 0 ? (pageIndex + 1) / pages.length : 0
  const progressPercent = book
    ? Math.round(((chapterIndex + chapterFraction) / book.chapters.length) * 100)
    : 0

  const canGoPrev = pageIndex > 0 || chapterIndex > 0
  const canGoNext =
    pages.length > 0
      ? pageIndex < pages.length - 1 || chapterIndex < (book?.chapters.length ?? 1) - 1
      : false

  const readerStyle = readingSettings
    ? ({
        '--reader-font-size': `${readingSettings.fontSize}px`,
        '--reader-line-height': String(readingSettings.lineHeight),
        '--reader-bg': theme.background,
        '--reader-text': theme.text,
        '--reader-bar': theme.bar,
      } as React.CSSProperties)
    : undefined

  const persistPage = useCallback(
    (nextPageIndex: number) => {
      if (!book) return
      if (progressSaveTimer.current) clearTimeout(progressSaveTimer.current)
      progressSaveTimer.current = setTimeout(() => {
        saveProgress(book.id, chapterIndex, nextPageIndex)
      }, 200)
    },
    [book, chapterIndex],
  )

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
        chapterLandRef.current = {
          mode: 'restore',
          page: saved?.pageIndex ?? 0,
        }
        setBook(parsed)
        setChapterIndex(safeIndex)
        setPageIndex(0)
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
    chapterLandAppliedRef.current = false
  }, [chapterIndex])

  useEffect(() => {
    if (!pages.length || paginating || chapterLandAppliedRef.current) return

    const land = chapterLandRef.current
    let nextPage = 0

    if (land.mode === 'end') {
      nextPage = pages.length - 1
    } else if (land.mode === 'restore') {
      nextPage = Math.min(land.page ?? 0, pages.length - 1)
    }

    chapterLandRef.current = { mode: 'start' }
    chapterLandAppliedRef.current = true
    setPageIndex(nextPage)
    if (book) saveProgress(book.id, chapterIndex, nextPage)
  }, [pages, paginating, book, chapterIndex])

  useEffect(() => {
    if (!pages.length) return
    if (pageIndex >= pages.length) {
      const clamped = pages.length - 1
      setPageIndex(clamped)
      persistPage(clamped)
    }
  }, [pages, pageIndex, persistPage])

  const handleWordTap = useCallback((rawWord: string) => {
    setWordLookup({ word: rawWord, exactToken: false, seq: Date.now() })
  }, [])

  function goPrev() {
    if (!book || !canGoPrev) return
    setWordLookup(null)

    if (pageIndex > 0) {
      const next = pageIndex - 1
      setPageIndex(next)
      persistPage(next)
      return
    }

    chapterLandRef.current = { mode: 'end' }
    setChapterIndex((i) => i - 1)
  }

  function goNext() {
    if (!book || !canGoNext) return
    setWordLookup(null)

    if (pages.length > 0 && pageIndex < pages.length - 1) {
      const next = pageIndex + 1
      setPageIndex(next)
      persistPage(next)
      return
    }

    if (chapterIndex < book.chapters.length - 1) {
      chapterLandRef.current = { mode: 'start' }
      saveProgress(book.id, chapterIndex + 1, 0)
      setChapterIndex((i) => i + 1)
    }
  }

  function exitBook() {
    if (book) {
      saveProgress(book.id, chapterIndex, pageIndex)
    }
    setOverlay(null)
    setWordLookup(null)
    onExit()
  }

  function selectChapter(index: number) {
    if (!book) return
    saveProgress(book.id, chapterIndex, pageIndex)
    chapterLandRef.current = { mode: 'start' }
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

  const pageLabel =
    pages.length > 0 ? `${pageIndex + 1}/${pages.length}` : '—'

  return (
    <div className="reader-screen" style={readerStyle}>
      <header className="reader-top-bar">
        <span className="reader-chapter-name">{chapter?.title ?? ''}</span>
      </header>

      <main className="reader-body">
        <div ref={setViewportEl} className="reader-page-viewport">
          {loading && <p className="reader-status">加载章节中…</p>}
          {error && <p className="error">{error}</p>}
          {!loading && !error && paginating && (
            <p className="reader-status">排版分页中…</p>
          )}
          {!loading && !error && !paginating && pages[pageIndex] && (
            <ChapterContent html={pages[pageIndex]} onWordTap={handleWordTap} />
          )}
        </div>
      </main>

      <footer className="reader-meta">
        <span>
          {progressPercent}% · {pageLabel}
        </span>
        <span>{now}</span>
      </footer>

      <nav className="reader-bottom-nav">
        <button type="button" onClick={goPrev} disabled={!canGoPrev}>
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
        <button type="button" onClick={goNext} disabled={!canGoNext}>
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
