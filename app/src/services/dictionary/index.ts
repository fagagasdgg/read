import { normalizeWordToken, toLemma } from '../../lib/lemmatize'
import { extractVariantLookupWord } from '../../lib/variantToken'
import {
  getCachedRecord,
  getCachedRecords,
  isLemmaMarkedNotFound,
  setCachedWord,
  setCachedWordAlias,
  setNotFoundLemma,
  shouldRetryNotFound,
} from './cache'
import { fetchFrequencyForLemmaIfMissing } from './batchFrequency'
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
  listNotFoundLemmas,
} from './cache'
export { batchFetchWordFrequencies } from './batchFrequency'
export { saveManualWordEntry, parseDoubaoWordClipboard, type ManualWordDraft } from './manualWord'
export { formatWordFrequency, formatCollinsStar } from './wordFrequency'
export { DICTIONARY_SOURCES, getDictionarySourceLabel } from './providers'
export {
  formatSourceCheckTime,
  getDictionarySourceStatus,
  probeDictionarySources,
  subscribeDictionarySourceStatus,
} from './sourceStatus'
export type { SourceHealth, SourceStatusView } from './sourceStatus'
export { playSpeech, playSpeechWord, playSpeechWithFallback } from './speech'

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

function buildLookupKeys(rawWord: string, exactToken: boolean): string[] {
  const surface = normalizeWordToken(rawWord)
  if (!surface) return []
  if (exactToken) return [surface]

  const lemma = toLemma(rawWord)
  if (lemma && lemma !== surface) return [surface, lemma]
  return [surface]
}

async function lookupSingleKey(
  key: string,
  options: LookupOptions,
): Promise<{ entry: WordEntry; fromCache: boolean } | 'miss' | 'blocked'> {
  const record = !options.forceRefresh ? await getCachedRecord(key) : null

  if (record) {
    if (isWordEntry(record)) return { entry: record, fromCache: true }
    if (isWordNotFoundMarker(record) && !shouldRetryNotFound(record)) {
      return 'blocked'
    }
  }

  try {
    const entry = await fetchWordFromProviders(key, {
      skipSources: getSkipSources(record ?? undefined),
    })
    if (!entry) return 'miss'
    await setCachedWord(entry)
    void cacheVariantForms(entry)
    void fetchFrequencyForLemmaIfMissing(entry.lemma)
    return { entry, fromCache: false }
  } catch {
    return 'miss'
  }
}

/**
 * 查词：先全小写原词，未命中再试词形还原（兼容旧缓存中的 tell/book 等）。
 * 弹窗标题使用返回词条的 entry.lemma：
 * - 原词直接命中 → 多为该词本身（如 unperturbed）
 * - 靠还原命中 → 为原型（如 told→tell），与以往展示一致
 * 词形变体仍在「变体」区展示。
 */
export async function lookupWordDetailed(
  rawWord: string,
  options: LookupOptions = {},
): Promise<{ entry: WordEntry; fromCache: boolean } | null> {
  const keys = buildLookupKeys(rawWord, Boolean(options.exactToken))
  if (!keys.length) return null

  const surface = keys[0]

  for (const key of keys) {
    const result = await lookupSingleKey(key, options)
    if (result === 'blocked' || result === 'miss') continue
    // 还原命中时，把词条也挂到原词 key，下次点原词可直接命中缓存；标题仍用 entry.lemma（原型）
    if (key !== surface) {
      await setCachedWordAlias(surface, result.entry)
    }
    return result
  }

  await setNotFoundLemma(surface)
  return null
}

export async function lookupWord(
  rawWord: string,
  options: LookupOptions = {},
): Promise<WordEntry | null> {
  const result = await lookupWordDetailed(rawWord, options)
  return result?.entry ?? null
}

/** 批量查词：每个 key 先查自身，再试 toLemma；结果挂到请求的 key 上 */
export async function lookupLemmasBatch(
  lemmas: string[],
  options: { prefetchVariants?: boolean } = {},
): Promise<Map<string, WordEntry>> {
  const unique = [...new Set(lemmas.filter(Boolean))]
  const found = new Map<string, WordEntry>()
  if (!unique.length) return found

  const altUnique = [
    ...new Set(
      unique.map((key) => toLemma(key)).filter((lemma) => Boolean(lemma) && !unique.includes(lemma)),
    ),
  ]
  const records = await getCachedRecords([...unique, ...altUnique])

  const missing: string[] = []

  for (const key of unique) {
    const direct = records.get(key)
    if (direct && isWordEntry(direct)) {
      found.set(key, direct)
      continue
    }

    const lemma = toLemma(key)
    if (lemma && lemma !== key) {
      const viaLemma = records.get(lemma)
      if (viaLemma && isWordEntry(viaLemma)) {
        found.set(key, viaLemma)
        continue
      }
    }

    const surfaceBlocked =
      direct && isWordNotFoundMarker(direct) && !shouldRetryNotFound(direct)
    const lemmaRecord = lemma && lemma !== key ? records.get(lemma) : undefined
    const lemmaBlocked =
      lemmaRecord && isWordNotFoundMarker(lemmaRecord) && !shouldRetryNotFound(lemmaRecord)

    if (surfaceBlocked && (lemmaBlocked || !lemma || lemma === key)) {
      continue
    }

    missing.push(key)
  }

  if (!missing.length) return found

  const concurrency = 6
  let index = 0

  async function processKey(key: string): Promise<void> {
    const candidates = buildLookupKeys(key, false)
    for (const candidate of candidates) {
      const prior = records.get(candidate)
      if (prior && isWordNotFoundMarker(prior) && !shouldRetryNotFound(prior)) {
        continue
      }
      try {
        const entry = await fetchWordFromProviders(candidate, {
          skipSources: getSkipSources(prior),
        })
        if (!entry) continue
        await setCachedWord(entry)
        if (candidate !== key) {
          await setCachedWordAlias(key, entry)
        }
        found.set(key, entry)
        if (options.prefetchVariants) {
          void cacheVariantForms(entry)
        }
        return
      } catch {
        // try next candidate
      }
    }
    await setNotFoundLemma(key)
  }

  async function worker(): Promise<void> {
    while (index < missing.length) {
      const key = missing[index++]
      await processKey(key)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, missing.length) }, () => worker()),
  )

  return found
}

/** 仅从本地缓存解析词条（不联网）；若 key 未命中会再试 toLemma */
export async function lookupLemmasLocal(lemmas: string[]): Promise<Map<string, WordEntry>> {
  const unique = [...new Set(lemmas.filter(Boolean))]
  const altUnique = [
    ...new Set(
      unique.map((key) => toLemma(key)).filter((lemma) => lemma && !unique.includes(lemma)),
    ),
  ]
  const records = await getCachedRecords([...unique, ...altUnique])
  const found = new Map<string, WordEntry>()
  for (const key of unique) {
    const direct = records.get(key)
    if (direct && isWordEntry(direct)) {
      found.set(key, direct)
      continue
    }
    const lemma = toLemma(key)
    if (lemma && lemma !== key) {
      const viaLemma = records.get(lemma)
      if (viaLemma && isWordEntry(viaLemma)) found.set(key, viaLemma)
    }
  }
  return found
}
