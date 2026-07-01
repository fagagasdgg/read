import { useEffect, useState } from 'react'
import { shouldShowInlineForWord } from '../../lib/examLevel'
import { formatInlineGloss } from '../../lib/formatInlineGloss'
import { toLemma } from '../../lib/lemmatize'
import { lookupWord } from '../../services/dictionary'
import type { UserSettings } from '../../services/settings/userSettings'

function collectVisibleLemmas(contentEl: HTMLElement, viewportEl: HTMLElement): string[] {
  const bounds = viewportEl.getBoundingClientRect()
  const lemmas = new Set<string>()

  for (const el of contentEl.querySelectorAll<HTMLElement>('.reader-word')) {
    const rect = el.getBoundingClientRect()
    if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) continue
    if (rect.right <= bounds.left || rect.left >= bounds.right) continue

    const lemma = toLemma(el.dataset.word ?? el.textContent ?? '')
    if (lemma) lemmas.add(lemma)
  }

  return [...lemmas]
}

async function lookupLemmasInPool(
  lemmas: string[],
  userSettings: UserSettings,
  onLemma: (lemma: string, gloss: string) => void,
  cancelled: () => boolean,
): Promise<void> {
  const queue = [...lemmas]
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length > 0) {
      if (cancelled()) return
      const lemma = queue.shift()
      if (!lemma) return

      const entry = await lookupWord(lemma)
      if (!entry || cancelled()) return
      if (!shouldShowInlineForWord(entry.examLevels, userSettings.englishLevel)) return

      onLemma(lemma, formatInlineGloss(entry, userSettings.maxInlineMeanings))
    }
  })

  await Promise.all(workers)
}

export function useInlineGlosses(
  contentEl: HTMLElement | null,
  viewportEl: HTMLElement | null,
  pageIndex: number,
  pageHeight: number,
  layoutStable: boolean,
  userSettings: UserSettings | null,
  chapterHtml: string,
): { glosses: Record<string, string>; loading: boolean } {
  const [glosses, setGlosses] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!userSettings?.showInlineTranslation || !contentEl || !viewportEl || !layoutStable) {
      setGlosses({})
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setGlosses({})

    const run = async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
      if (cancelled) return

      const lemmas = collectVisibleLemmas(contentEl, viewportEl)
      const next: Record<string, string> = {}

      await lookupLemmasInPool(
        lemmas,
        userSettings,
        (lemma, gloss) => {
          next[lemma] = gloss
          if (!cancelled) setGlosses({ ...next })
        },
        () => cancelled,
      )

      if (!cancelled) setLoading(false)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [
    contentEl,
    viewportEl,
    pageIndex,
    pageHeight,
    layoutStable,
    userSettings,
    chapterHtml,
  ])

  return { glosses, loading }
}
