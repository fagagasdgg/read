import { getCachedWord, listCachedWords, setCachedWord } from './cache'
import { isFrequencyComplete, fetchWordFrequency } from './wordFrequency'
import type { WordEntry } from './types'

export interface FrequencyBatchProgress {
  total: number
  done: number
  currentLemma: string
  updated: number
  skipped: number
  failed: number
}

export interface FrequencyBatchOptions {
  onProgress?: (progress: FrequencyBatchProgress) => void
  signal?: AbortSignal
  concurrency?: number
}

function needsFrequencyFetch(entry: WordEntry): boolean {
  return !isFrequencyComplete(entry.frequency)
}

export async function batchFetchWordFrequencies(
  options: FrequencyBatchOptions = {},
): Promise<{ updated: number; skipped: number; failed: number }> {
  const all = await listCachedWords()
  const pending = all.filter(needsFrequencyFetch)
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8))

  let done = 0
  let updated = 0
  let skipped = all.length - pending.length
  let failed = 0
  let index = 0

  const report = (currentLemma: string) => {
    options.onProgress?.({
      total: pending.length,
      done,
      currentLemma,
      updated,
      skipped,
      failed,
    })
  }

  async function processLemma(lemma: string): Promise<void> {
    if (options.signal?.aborted) return

    report(lemma)
    try {
      const frequency = await fetchWordFrequency(lemma)
      const existing = (await getCachedWord(lemma)) ?? all.find((item) => item.lemma === lemma)
      if (!existing) {
        failed += 1
        return
      }

      if (!frequency) {
        skipped += 1
        return
      }

      await setCachedWord({
        ...existing,
        frequency: {
          ...existing.frequency,
          ...frequency,
          fetchedAt: Date.now(),
        },
      })
      updated += 1
    } catch {
      failed += 1
    } finally {
      done += 1
      report(lemma)
    }
  }

  async function worker(): Promise<void> {
    while (index < pending.length) {
      if (options.signal?.aborted) return
      const lemma = pending[index++]?.lemma
      if (!lemma) continue
      await processLemma(lemma)
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
  }

  report('')
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length || 1) }, () => worker()))

  return { updated, skipped, failed }
}

export async function fetchFrequencyForLemmaIfMissing(lemma: string): Promise<void> {
  const entry = await getCachedWord(lemma)
  if (!entry || !needsFrequencyFetch(entry)) return

  try {
    const frequency = await fetchWordFrequency(lemma)
    if (!frequency) return
    await setCachedWord({
      ...entry,
      frequency: {
        ...entry.frequency,
        ...frequency,
        fetchedAt: Date.now(),
      },
    })
  } catch {
    // 后台补全失败不影响点词
  }
}
