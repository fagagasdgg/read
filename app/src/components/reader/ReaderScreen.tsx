import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type EpubBook,
  loadChapterHtml,
  loadEpubFromDevice,
  loadProgressAsync,
  saveProgress,
  saveProgressAsync,
  touchBookLastRead,
} from '../../services/epub'
import {
  getFontById,
  getThemeById,
  loadReadingSettings,
  type ReadingSettings,
} from '../../services/settings/readingSettings'
import {
  loadUserSettings,
  type UserSettings,
} from '../../services/settings/userSettings'
import { ChapterContent } from './ChapterContent'
import { ReaderControlPanel } from './ReaderControlPanel'
import { ReadingSettingsPanel } from './ReadingSettingsPanel'
import { TocPanel } from './TocPanel'
import { useInlineGlosses } from './useInlineGlosses'
import { useViewportPagination, shouldWaitForMultiPageLand } from './useViewportPagination'
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
  const [chapterHtmlReadyIndex, setChapterHtmlReadyIndex] = useState(-1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [wordLookup, setWordLookup] = useState<WordLookupRequest | null>(null)
  const [now, setNow] = useState(() => formatTime(new Date()))
  const [overlay, setOverlay] = useState<ReaderOverlay>(null)
  const [readingSettings, setReadingSettings] = useState<ReadingSettings | null>(null)
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null)
  const [viewportEl, setViewportEl] = useState<HTMLElement | null>(null)
  const [contentEl, setContentEl] = useState<HTMLElement | null>(null)
  const chapterLandRef = useRef<{ mode: ChapterLandMode; page?: number }>({ mode: 'start' })
  const chapterLandAppliedRef = useRef(false)
  const progressSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const remeasureKey = `${chapterIndex}:${chapterHtml}:${readingSettings?.fontSize ?? ''}:${readingSettings?.lineHeight ?? ''}:${readingSettings?.fontFamilyId ?? ''}`
  const { pageHeight, pageCount, measuring, layoutStable } = useViewportPagination(
    contentEl,
    viewportEl,
    remeasureKey,
  )

  const { glosses } = useInlineGlosses(
    contentEl,
    viewportEl,
    chapterIndex,
    pageIndex,
    pageHeight,
    layoutStable,
    userSettings,
  )

  const chapter = book?.chapters[chapterIndex]
  const theme = getThemeById(readingSettings?.themeId ?? 'parchment')
  const font = getFontById(readingSettings?.fontFamilyId ?? 'serif')
  const chapterFraction = pageCount > 0 ? (pageIndex + 1) / pageCount : 0
  const progressPercent = book
    ? Math.round(((chapterIndex + chapterFraction) / book.chapters.length) * 100)
    : 0

  const canGoPrev = pageIndex > 0 || chapterIndex > 0
  const canGoNext =
    pageCount > 0
      ? pageIndex < pageCount - 1 || chapterIndex < (book?.chapters.length ?? 1) - 1
      : false

  const readerStyle = readingSettings
    ? ({
        '--reader-font-size': `${readingSettings.fontSize}px`,
        '--reader-line-height': String(readingSettings.lineHeight),
        '--reader-font-family': font.stack,
        '--reader-inline-gloss-size': `${userSettings?.inlineGlossFontSize ?? 11}px`,
        '--reader-inline-gloss-color': userSettings?.inlineGlossColor ?? '#6b7280',
        '--reader-inline-gloss-offset-x': `${userSettings?.inlineGlossOffsetX ?? 0}px`,
        '--reader-inline-gloss-offset-y': `${userSettings?.inlineGlossOffsetY ?? 0}px`,
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

  const flushProgress = useCallback(async () => {
    if (!book) return
    if (progressSaveTimer.current) {
      clearTimeout(progressSaveTimer.current)
      progressSaveTimer.current = null
    }
    await saveProgressAsync(book.id, chapterIndex, pageIndex)
  }, [book, chapterIndex, pageIndex])

  useEffect(() => () => {
    void flushProgress()
  }, [flushProgress])

  useEffect(() => {
    const timer = setInterval(() => setNow(formatTime(new Date())), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    void loadReadingSettings().then(setReadingSettings)
    void loadUserSettings().then(setUserSettings)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    loadEpubFromDevice(bookId)
      .then(async (parsed) => {
        if (cancelled) return
        const saved = await loadProgressAsync(parsed.id)
        const startIndex = saved?.chapterIndex ?? 0
        const safeIndex = Math.min(startIndex, parsed.chapters.length - 1)
        chapterLandRef.current = {
          mode: 'restore',
          page: saved?.pageIndex ?? 0,
        }
        chapterLandAppliedRef.current = false
        setBook(parsed)
        setChapterIndex(safeIndex)
        setPageIndex(0)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '无法打开书籍')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [bookId])

  useEffect(() => {
    if (!book) return
    let cancelled = false
    let revokeAssets: (() => void) | undefined

    setChapterHtml('')
    setChapterHtmlReadyIndex(-1)
    setLoading(true)
    setError('')

    const requestedChapter = chapterIndex

    loadChapterHtml(book, chapterIndex)
      .then((result) => {
        if (cancelled) {
          result.revoke()
          return
        }
        revokeAssets = result.revoke
        setChapterHtml(result.html)
        setChapterHtmlReadyIndex(requestedChapter)
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
    setChapterHtmlReadyIndex(-1)
    setPageIndex(0)
  }, [chapterIndex])

  useEffect(() => {
    if (
      !book ||
      !chapterHtml ||
      chapterHtmlReadyIndex !== chapterIndex ||
      loading ||
      measuring ||
      !layoutStable ||
      chapterLandAppliedRef.current
    ) {
      return
    }

    const land = chapterLandRef.current
    if (land.mode === 'start') {
      chapterLandAppliedRef.current = true
      return
    }

    const targetPage =
      land.mode === 'end' ? pageCount - 1 : Math.min(land.page ?? 0, pageCount - 1)

    if (
      shouldWaitForMultiPageLand(land.mode, targetPage, pageCount, pageHeight, contentEl)
    ) {
      return
    }

    chapterLandRef.current = { mode: 'start' }
    chapterLandAppliedRef.current = true
    setPageIndex(targetPage)
    void saveProgressAsync(book.id, chapterIndex, targetPage)
  }, [
    pageCount,
    pageHeight,
    measuring,
    layoutStable,
    loading,
    chapterHtml,
    book,
    chapterIndex,
    chapterHtmlReadyIndex,
    contentEl,
  ])

  useEffect(() => {
    if (!pageCount) return
    if (pageIndex >= pageCount) {
      const clamped = pageCount - 1
      setPageIndex(clamped)
      persistPage(clamped)
    }
  }, [pageCount, pageIndex, persistPage])

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
    chapterLandAppliedRef.current = false
    setChapterIndex((i) => i - 1)
  }

  function goNext() {
    if (!book || !canGoNext) return
    setWordLookup(null)

    if (pageCount > 0 && pageIndex < pageCount - 1) {
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
    void flushProgress()
    setOverlay(null)
    setWordLookup(null)
    onExit()
  }

  function selectChapter(index: number) {
    if (!book) return
    void flushProgress()
    chapterLandRef.current = { mode: 'start' }
    chapterLandAppliedRef.current = false
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

  const pageLabel = pageCount > 0 ? `${pageIndex + 1}/${pageCount}` : '—'
  const pageOffset = pageHeight > 0 ? pageIndex * pageHeight : 0

  return (
    <div className="reader-screen" style={readerStyle}>
      <header className="reader-top-bar">
        <span className="reader-chapter-name">{chapter?.title ?? ''}</span>
      </header>

      <main className="reader-body">
        <div ref={setViewportEl} className="reader-page-viewport">
          {loading && <p className="reader-status">加载章节中…</p>}
          {error && <p className="error">{error}</p>}
          {!loading && !error && measuring && chapterHtml && (
            <p className="reader-status">排版分页中…</p>
          )}
          {!loading && !error && chapterHtml && (
            <div
              className="reader-page-content"
              ref={setContentEl}
              style={{ transform: `translateY(-${pageOffset}px)` }}
            >
              <ChapterContent
                html={chapterHtml}
                onWordTap={handleWordTap}
                glosses={glosses}
              />
            </div>
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

      {overlay === 'settings' && readingSettings && userSettings && (
        <ReadingSettingsPanel
          settings={readingSettings}
          userSettings={userSettings}
          onChange={setReadingSettings}
          onUserChange={setUserSettings}
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
