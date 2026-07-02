import { useEffect, useRef, useState } from 'react'
import { shouldShowInlineForWord } from '../../lib/examLevel'
import { formatInlineGloss } from '../../lib/formatInlineGloss'
import { toLemma } from '../../lib/lemmatize'
import {
  getCachedRecords,
  lookupLemmasBatch,
} from '../../services/dictionary'
import { shouldRetryNotFound } from '../../services/dictionary/cache'
import { isWordNotFoundMarker } from '../../services/dictionary/types'
import type { UserSettings } from '../../services/settings/userSettings'

/** 按章节保留行间释义会话缓存，避免重进章节时重复读库 */
const glossSessionByChapter = new Map<number, Map<string, string | null>>()

function getChapterSession(chapterIndex: number): Map<string, string | null> {
  let session = glossSessionByChapter.get(chapterIndex)
  if (!session) {
    session = new Map()
    glossSessionByChapter.set(chapterIndex, session)
  }
  return session
}

function glossMapsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false
  }
  return true
}

function collectVisibleLemmas(contentEl: HTMLElement, viewportEl: HTMLElement): string[] {
  const bounds = viewportEl.getBoundingClientRect()
  const lemmas = new Set<string>()

  for (const el of contentEl.querySelectorAll<HTMLElement>('.reader-word')) {
    const rect = el.getBoundingClientRect()
    if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) continue
    if (rect.right <= bounds.left || rect.left >= bounds.right) continue

    const lemma =
      el.dataset.lemma || toLemma(el.dataset.word ?? el.textContent ?? '')
    if (lemma) lemmas.add(lemma)
  }

  return [...lemmas]
}

function collectPageLemmas(
  contentEl: HTMLElement,
  viewportEl: HTMLElement,
  pageOffset: number,
): string[] {
  const bounds = viewportEl.getBoundingClientRect()
  const lemmas = new Set<string>()

  for (const el of contentEl.querySelectorAll<HTMLElement>('.reader-word')) {
    const rect = el.getBoundingClientRect()
    const top = rect.top - bounds.top + pageOffset
    const bottom = rect.bottom - bounds.top + pageOffset
    const viewHeight = bounds.height

    if (bottom <= 0 || top >= viewHeight) continue

    const lemma =
      el.dataset.lemma || toLemma(el.dataset.word ?? el.textContent ?? '')
    if (lemma) lemmas.add(lemma)
  }

  return [...lemmas]
}

function glossesFromSession(
  session: Map<string, string | null>,
  lemmas: string[],
): Record<string, string> {
  const glosses: Record<string, string> = {}
  for (const lemma of lemmas) {
    const cached = session.get(lemma)
    if (cached) glosses[lemma] = cached
  }
  return glosses
}

function applyRecordToSession(
  session: Map<string, string | null>,
  lemma: string,
  record: import('../../services/dictionary/types').DictionaryCacheValue | undefined,
  userSettings: UserSettings,
): string | null {
  if (!record) return null

  if (isWordNotFoundMarker(record)) {
    if (shouldRetryNotFound(record)) return null
    session.set(lemma, null)
    return null
  }

  if (!shouldShowInlineForWord(record.examLevels, userSettings.englishLevel)) {
    session.set(lemma, null)
    return null
  }

  const text = formatInlineGloss(record, userSettings.maxInlineMeanings)
  session.set(lemma, text)
  return text
}

async function hydrateGlossesFromLocal(
  session: Map<string, string | null>,
  lemmas: string[],
  userSettings: UserSettings,
): Promise<Record<string, string>> {
  const needDb = lemmas.filter((lemma) => !session.has(lemma))
  if (needDb.length) {
    const records = await getCachedRecords(needDb)
    for (const lemma of needDb) {
      applyRecordToSession(session, lemma, records.get(lemma), userSettings)
    }
  }

  return glossesFromSession(session, lemmas)
}

export function useInlineGlosses(
  contentEl: HTMLElement | null,
  viewportEl: HTMLElement | null,
  chapterIndex: number,
  pageIndex: number,
  pageHeight: number,
  layoutStable: boolean,
  userSettings: UserSettings | null,
): { glosses: Record<string, string>; loading: boolean } {
  const [glosses, setGlosses] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const runIdRef = useRef(0)

  useEffect(() => {
    if (!userSettings) return
    glossSessionByChapter.forEach((session) => session.clear())
  }, [userSettings?.englishLevel, userSettings?.showInlineTranslation])

  useEffect(() => {
    if (!userSettings?.showInlineTranslation) {
      setGlosses({})
      setLoading(false)
      return
    }

    if (!contentEl || !viewportEl || !layoutStable) {
      return
    }

    const session = getChapterSession(chapterIndex)
    const runId = ++runIdRef.current
    let cancelled = false

    const run = async () => {
      const lemmas = collectVisibleLemmas(contentEl, viewportEl)
      if (!lemmas.length) {
        setGlosses((prev) => (Object.keys(prev).length ? {} : prev))
        setLoading(false)
        return
      }

      const sessionGlosses = glossesFromSession(session, lemmas)
      if (!cancelled && runId === runIdRef.current) {
        setGlosses((prev) => (glossMapsEqual(prev, sessionGlosses) ? prev : sessionGlosses))
      }

      const localGlosses = await hydrateGlossesFromLocal(session, lemmas, userSettings)
      if (cancelled || runId !== runIdRef.current) return

      setGlosses((prev) => (glossMapsEqual(prev, localGlosses) ? prev : localGlosses))

      const missing = lemmas.filter((lemma) => !session.has(lemma))
      if (!missing.length) {
        setLoading(false)
        return
      }

      setLoading(true)

      try {
        await lookupLemmasBatch(missing, { prefetchVariants: true })
        if (cancelled || runId !== runIdRef.current) return

        const records = await getCachedRecords(missing)
        const next = { ...localGlosses }
        for (const lemma of missing) {
          applyRecordToSession(session, lemma, records.get(lemma), userSettings)
          const text = session.get(lemma)
          if (text) next[lemma] = text
        }
        setGlosses((prev) => (glossMapsEqual(prev, next) ? prev : next))
      } finally {
        if (!cancelled && runId === runIdRef.current) {
          setLoading(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [
    contentEl,
    viewportEl,
    chapterIndex,
    pageIndex,
    layoutStable,
    userSettings,
  ])

  useEffect(() => {
    if (
      !userSettings?.showInlineTranslation ||
      !contentEl ||
      !viewportEl ||
      !layoutStable ||
      pageHeight <= 0
    ) {
      return
    }

    const session = getChapterSession(chapterIndex)
    const offsets = [pageHeight, -pageHeight]

    const timer = window.setTimeout(() => {
      const prefetch = new Set<string>()
      for (const offset of offsets) {
        for (const lemma of collectPageLemmas(contentEl, viewportEl, offset)) {
          if (!session.has(lemma)) prefetch.add(lemma)
        }
      }
      if (prefetch.size) {
        void lookupLemmasBatch([...prefetch], { prefetchVariants: false })
      }
    }, 120)

    return () => window.clearTimeout(timer)
  }, [
    contentEl,
    viewportEl,
    chapterIndex,
    pageIndex,
    pageHeight,
    layoutStable,
    userSettings?.showInlineTranslation,
  ])

  return { glosses, loading }
}
