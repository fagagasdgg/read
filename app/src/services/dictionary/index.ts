import { normalizeWordToken, toLemma } from '../../lib/lemmatize'
import { extractVariantLookupWord } from '../../lib/variantToken'
import { getCachedWord, getCachedWords, setCachedWord } from './cache'
import { fetchFromYoudao } from './youdao'
import type { LookupOptions, WordEntry } from './types'

export type { LookupOptions, WordEntry, WordDefinition, WordForm, ExamLevel } from './types'
export { exportCachedWordsJson, listCachedWords } from './cache'
export { playSpeech, playSpeechWord } from './speech'

export interface LookupResult {
  entry: WordEntry
  fromCache: boolean
}

async function cacheVariantForms(entry: WordEntry): Promise<void> {
  const tasks = entry.forms.map(async (form) => {
    const token = extractVariantLookupWord(form.value)
    if (!token) return
    const lemma = normalizeWordToken(token)
    if (!lemma || lemma === entry.lemma) return

    const existing = await getCachedWord(lemma)
    if (existing) return

    try {
      const variantEntry = await fetchFromYoudao(lemma)
      if (variantEntry) await setCachedWord(variantEntry)
    } catch {
      // 变体预取失败不影响主词
    }
  })

  await Promise.all(tasks)
}

export async function lookupWordDetailed(
  rawWord: string,
  options: LookupOptions = {},
): Promise<LookupResult | null> {
  const lemma = options.exactToken ? normalizeWordToken(rawWord) : toLemma(rawWord)
  if (!lemma) return null

  if (!options.forceRefresh) {
    const cached = await getCachedWord(lemma)
    if (cached) return { entry: cached, fromCache: true }
  }

  const entry = await fetchFromYoudao(lemma)
  if (!entry) return null

  await setCachedWord(entry)
  void cacheVariantForms(entry)

  return { entry, fromCache: false }
}

export async function lookupWord(
  rawWord: string,
  options: LookupOptions = {},
): Promise<WordEntry | null> {
  const result = await lookupWordDetailed(rawWord, options)
  return result?.entry ?? null
}

/** 批量查词：先读本地缓存，仅对未命中词联网；结果写入 IndexedDB */
export async function lookupLemmasBatch(
  lemmas: string[],
  options: { prefetchVariants?: boolean } = {},
): Promise<Map<string, WordEntry>> {
  const unique = [...new Set(lemmas.filter(Boolean))]
  const found = await getCachedWords(unique)
  const missing = unique.filter((lemma) => !found.has(lemma))

  if (!missing.length) return found

  const concurrency = 6
  let index = 0

  async function worker(): Promise<void> {
    while (index < missing.length) {
      const lemma = missing[index++]
      try {
        const entry = await fetchFromYoudao(lemma)
        if (!entry) continue
        await setCachedWord(entry)
        found.set(lemma, entry)
        if (options.prefetchVariants) {
          void cacheVariantForms(entry)
        }
      } catch {
        // 单词查询失败，跳过
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, missing.length) }, () => worker()),
  )

  return found
}
