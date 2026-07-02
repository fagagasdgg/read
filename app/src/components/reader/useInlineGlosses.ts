import { useEffect, useRef, useState } from 'react'
import { shouldShowInlineForWord } from '../../lib/examLevel'
import { formatInlineGloss } from '../../lib/formatInlineGloss'
import { toLemma } from '../../lib/lemmatize'
import { lookupLemmasBatch } from '../../services/dictionary'
import type { UserSettings } from '../../services/settings/userSettings'

/** 本章内已解析的行间释义（含「不显示」标记），避免翻页反复清空 */
const glossSessionCache = new Map<string, string | null>()

function clearGlossSessionCache(): void {
  glossSessionCache.clear()
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

function buildGlossMap(
  lemmas: string[],
  entries: Map<string, import('../../services/dictionary/types').WordEntry>,
  userSettings: UserSettings,
): Record<string, string> {
  const glosses: Record<string, string> = {}

  for (const lemma of lemmas) {
    const entry = entries.get(lemma)
    if (!entry) continue

    if (!shouldShowInlineForWord(entry.examLevels, userSettings.englishLevel)) {
      glossSessionCache.set(lemma, null)
      continue
    }

    const text = formatInlineGloss(entry, userSettings.maxInlineMeanings)
    glossSessionCache.set(lemma, text)
    glosses[lemma] = text
  }

  return glosses
}

function glossesFromSession(lemmas: string[]): Record<string, string> {
  const glosses: Record<string, string> = {}
  for (const lemma of lemmas) {
    const cached = glossSessionCache.get(lemma)
    if (cached) glosses[lemma] = cached
  }
  return glosses
}

export function useInlineGlosses(
  contentEl: HTMLElement | null,
  viewportEl: HTMLElement | null,
  pageIndex: number,
  layoutStable: boolean,
  userSettings: UserSettings | null,
  chapterHtml: string,
): { glosses: Record<string, string>; loading: boolean } {
  const [glosses, setGlosses] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const runIdRef = useRef(0)
  const pageKeyRef = useRef('')

  useEffect(() => {
    clearGlossSessionCache()
    pageKeyRef.current = ''
  }, [chapterHtml, userSettings?.englishLevel, userSettings?.showInlineTranslation])

  useEffect(() => {
    if (!userSettings?.showInlineTranslation) {
      setGlosses({})
      setLoading(false)
      return
    }

    if (!contentEl || !viewportEl || !layoutStable || !chapterHtml) {
      return
    }

    const pageKey = `${chapterHtml}:${pageIndex}`
    const pageChanged = pageKeyRef.current !== pageKey
    pageKeyRef.current = pageKey

    const runId = ++runIdRef.current
    let cancelled = false

    const run = async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
      if (cancelled || runId !== runIdRef.current) return

      const lemmas = collectVisibleLemmas(contentEl, viewportEl)
      if (!lemmas.length) {
        setGlosses({})
        setLoading(false)
        return
      }

      const cachedGlosses = glossesFromSession(lemmas)
      if (pageChanged || Object.keys(cachedGlosses).length > 0) {
        setGlosses(cachedGlosses)
      }

      const missing = lemmas.filter((lemma) => !glossSessionCache.has(lemma))
      if (!missing.length) {
        setLoading(false)
        return
      }

      setLoading(true)

      try {
        const entries = await lookupLemmasBatch(missing, { prefetchVariants: true })
        if (cancelled || runId !== runIdRef.current) return

        const merged = buildGlossMap(lemmas, entries, userSettings)
        const next = { ...cachedGlosses, ...merged }
        setGlosses(next)
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
    pageIndex,
    layoutStable,
    userSettings,
    chapterHtml,
  ])

  return { glosses, loading }
}
