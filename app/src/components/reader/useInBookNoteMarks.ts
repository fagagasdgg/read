import { useEffect, useRef, useState } from 'react'
import { getBookDefaultNotebookId } from '../../services/notes/bookNotebook'
import { NOTEBOOK_DATA_CHANGED } from '../../services/notes/events'
import {
  getNotebookDocument,
  type NotebookEntry,
} from '../../services/notes/notebooks'
import {
  buildNormalizedTextMap,
  findSentenceUnderlineRects,
  type NoteMatchRect,
} from './matchNoteText'

export interface InBookNoteMark {
  key: string
  entry: NotebookEntry
  rects: NoteMatchRect[]
}

interface UseInBookNoteMarksOptions {
  bookId: string
  chapterIndex: number
  contentEl: HTMLElement | null
  layoutStable: boolean
  enabled: boolean
  /** 字体/行距等变化时触发重测 */
  layoutKey: string
}

/**
 * 按章异步匹配绑定笔记本中的原文，生成下划线矩形。
 * 优先处理带本章 chapterIndex 的新笔记，旧笔记仍全文匹配。
 */
export function useInBookNoteMarks({
  bookId,
  chapterIndex,
  contentEl,
  layoutStable,
  enabled,
  layoutKey,
}: UseInBookNoteMarksOptions): InBookNoteMark[] {
  const [marks, setMarks] = useState<InBookNoteMark[]>([])
  const runIdRef = useRef(0)
  const [dataEpoch, setDataEpoch] = useState(0)

  useEffect(() => {
    const onChanged = () => setDataEpoch((value) => value + 1)
    window.addEventListener(NOTEBOOK_DATA_CHANGED, onChanged)
    return () => window.removeEventListener(NOTEBOOK_DATA_CHANGED, onChanged)
  }, [])

  useEffect(() => {
    if (!enabled || !bookId || !contentEl || !layoutStable) {
      setMarks([])
      return
    }

    const runId = ++runIdRef.current
    let cancelled = false
    let resizeTimer: ReturnType<typeof setTimeout> | null = null

    const run = async () => {
      const notebookId = await getBookDefaultNotebookId(bookId)
      if (cancelled || runId !== runIdRef.current) return

      if (!notebookId) {
        setMarks([])
        return
      }

      const doc = await getNotebookDocument(notebookId)
      if (cancelled || runId !== runIdRef.current) return

      const entries = doc?.entries ?? []
      if (!entries.length) {
        setMarks([])
        return
      }

      // 先处理声称属于本章的条目，便于尽快画出线
      const preferred: NotebookEntry[] = []
      const rest: NotebookEntry[] = []
      for (const entry of entries) {
        if (entry.location?.chapterIndex === chapterIndex) preferred.push(entry)
        else rest.push(entry)
      }
      const ordered = [...preferred, ...rest]

      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve())
      })
      if (cancelled || runId !== runIdRef.current) return

      const textMap = buildNormalizedTextMap(contentEl)
      const next: InBookNoteMark[] = []

      const CHUNK = 8
      for (let i = 0; i < ordered.length; i += CHUNK) {
        if (cancelled || runId !== runIdRef.current) return
        const slice = ordered.slice(i, i + CHUNK)
        for (const entry of slice) {
          const rects = findSentenceUnderlineRects(contentEl, entry.sentence, textMap)
          if (!rects.length) continue
          next.push({
            key: `${entry.id}:${rects.map((r) => `${r.top}-${r.left}`).join('|')}`,
            entry,
            rects,
          })
        }
        if (i + CHUNK < ordered.length) {
          await new Promise<void>((resolve) => {
            window.setTimeout(() => resolve(), 0)
          })
        }
      }

      if (cancelled || runId !== runIdRef.current) return
      setMarks(next)
    }

    const schedule = () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        void run()
      }, 40)
    }

    schedule()

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    ro?.observe(contentEl)

    return () => {
      cancelled = true
      if (resizeTimer) clearTimeout(resizeTimer)
      ro?.disconnect()
    }
  }, [bookId, chapterIndex, contentEl, layoutStable, enabled, layoutKey, dataEpoch])

  return marks
}
