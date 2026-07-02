import { normalizeWordToken, toLemma } from '../../lib/lemmatize'
import { extractVariantLookupWord } from '../../lib/variantToken'
import {
  getCachedRecord,
  getCachedRecords,
  isLemmaMarkedNotFound,
  setCachedWord,
  setNotFoundLemma,
  shouldRetryNotFound,
} from './cache'
import { fetchWordFromProviders } from './lookup'
import { isWordEntry, isWordNotFoundMarker, type DictionaryCacheValue, type LookupOptions, type WordEntry } from './types'

export type {
  LookupOptions,
  WordEntry,
  WordDefinition,
  WordForm,
  ExamLevel,
  WordNotFoundMarker,
  DictionaryCacheValue,
  DictionarySourceId,
} from './types'
export {
  exportCachedWordsJson,
  getCachedRecords,
  getDictionaryCacheStats,
  listCachedWords,
} from './cache'
export { DICTIONARY_SOURCES, getDictionarySourceLabel } from './providers'
export { playSpeech, playSpeechWord } from './speech'

async function cacheVariantForms(entry: WordEntry): Promise<void> {
  const tasks = entry.forms.map(async (form) => {
    const token = extractVariantLookupWord(form.value)
    if (!token) return
    const lemma = normalizeWordToken(token)
    if (!lemma || lemma === entry.lemma) return

    if (await isLemmaMarkedNotFound(lemma)) return

    const existing = await getCachedRecord(lemma)
    if (existing) return

    try {
      const variantEntry = await fetchWordFromProviders(lemma)
      if (variantEntry) {
        await setCachedWord(variantEntry)
        return
      }
      await setNotFoundLemma(lemma)
    } catch {
      // 变体预取失败不影响主词
    }
  })

  await Promise.all(tasks)
}

function getSkipSources(record: DictionaryCacheValue | undefined) {
  if (!record || !isWordNotFoundMarker(record)) return []
  return record.triedSources ?? ['youdao']
}

export async function lookupWordDetailed(
  rawWord: string,
  options: LookupOptions = {},
): Promise<{ entry: WordEntry; fromCache: boolean } | null> {
  const lemma = options.exactToken ? normalizeWordToken(rawWord) : toLemma(rawWord)
  if (!lemma) return null

  const record = !options.forceRefresh ? await getCachedRecord(lemma) : null
  if (record) {
    if (isWordNotFoundMarker(record) && !shouldRetryNotFound(record)) return null
    if (isWordEntry(record)) return { entry: record, fromCache: true }
  }

  const entry = await fetchWordFromProviders(lemma, { skipSources: getSkipSources(record ?? undefined) })
  if (!entry) {
    await setNotFoundLemma(lemma)
    return null
  }

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

/** 批量查词：先读本地（含查不到标记），仅对未记录词联网 */
export async function lookupLemmasBatch(
  lemmas: string[],
  options: { prefetchVariants?: boolean } = {},
): Promise<Map<string, WordEntry>> {
  const unique = [...new Set(lemmas.filter(Boolean))]
  const records = await getCachedRecords(unique)
  const found = new Map<string, WordEntry>()

  for (const [lemma, record] of records) {
    if (isWordEntry(record)) found.set(lemma, record)
  }

  const missing = unique.filter((lemma) => {
    const record = records.get(lemma)
    if (!record) return true
    if (isWordNotFoundMarker(record)) return shouldRetryNotFound(record)
    return false
  })
  if (!missing.length) return found

  const concurrency = 6
  let index = 0

  async function worker(): Promise<void> {
    while (index < missing.length) {
      const lemma = missing[index++]
      const prior = records.get(lemma)
      try {
        const entry = await fetchWordFromProviders(lemma, {
          skipSources: getSkipSources(prior),
        })
        if (!entry) {
          await setNotFoundLemma(lemma)
          continue
        }
        await setCachedWord(entry)
        found.set(lemma, entry)
        if (options.prefetchVariants) {
          void cacheVariantForms(entry)
        }
      } catch {
        // 单词查询失败，跳过（下次可重试）
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, missing.length) }, () => worker()),
  )

  return found
}

/** 仅从本地缓存解析词条（不联网） */
export async function lookupLemmasLocal(lemmas: string[]): Promise<Map<string, WordEntry>> {
  const records = await getCachedRecords(lemmas)
  const found = new Map<string, WordEntry>()
  for (const [lemma, record] of records) {
    if (isWordEntry(record)) found.set(lemma, record)
  }
  return found
}
