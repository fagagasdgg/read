import { useEffect, useState } from 'react'
import { paginateChapterHtml } from '../../lib/chapterPaginate'
import type { ReadingSettings } from '../../services/settings/readingSettings'

export function useChapterPages(
  chapterHtml: string,
  viewportEl: HTMLElement | null,
  readingSettings: ReadingSettings | null,
): { pages: string[]; paginating: boolean } {
  const [pages, setPages] = useState<string[]>([])
  const [paginating, setPaginating] = useState(false)

  useEffect(() => {
    if (!chapterHtml || !viewportEl || !readingSettings) {
      setPages(chapterHtml ? [chapterHtml] : [])
      return
    }

    let cancelled = false
    setPaginating(true)

    const run = () => {
      const height = viewportEl.clientHeight
      const width = viewportEl.clientWidth
      if (height < 40 || width < 40) {
        if (!cancelled) setPaginating(false)
        return
      }

      const next = paginateChapterHtml(
        chapterHtml,
        height,
        width,
        readingSettings.fontSize,
        readingSettings.lineHeight,
      )
      if (!cancelled) {
        setPages(next)
        setPaginating(false)
      }
    }

    requestAnimationFrame(run)

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(run)
    })
    observer.observe(viewportEl)

    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [chapterHtml, viewportEl, readingSettings])

  return { pages, paginating }
}
