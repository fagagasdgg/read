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
import { lookupEcdictExact, lookupFromEcdict, getEcdictDb } from './ecdict'
import { fetchWordFromProviders } from './lookup'
import { resolveLemma } from './resolveLemma'
import {
  isWordEntry,
  isWordNotFoundMarker,
  type DictionaryCacheValue,
  type LookupOptions,
  type WordEntry,
} from './types'

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
export { isEcdictReady, lookupEcdictLemma, lookupFromEcdict } from './ecdict'
export { resolveLemma } from './resolveLemma'

/** 预热 ECDICT（后台加载），避免首次点词卡顿 */
export function prefetchEcdict(): void {
  void getEcdictDb()
}

function isOnlineCacheEntry(record: DictionaryCacheValue | null | undefined): record is WordEntry {
  return Boolean(record && isWordEntry(record) && record.source !== 'ecdict')
}

function getSkipSources(record: DictionaryCacheValue | undefined) {
  if (!record || !isWordNotFoundMarker(record)) return []
  return record.triedSources ?? ['youdao']
}

/** 仅查 ECDICT，绝不写入 IndexedDB 词条缓存 */
export async function lookupLocalWord(
  rawWord: string,
  options: LookupOptions = {},
): Promise<WordEntry | null> {
  const surface = normalizeWordToken(rawWord)
  if (!surface) return null

  if (options.exactToken) {
    const exact = await lookupEcdictExact(surface)
    if (exact) return exact
    return lookupFromEcdict(surface)
  }

  const lemma = await resolveLemma(rawWord, false)
  if (!lemma) return null

  const byLemma = await lookupEcdictExact(lemma)
  if (byLemma) return byLemma

  if (lemma !== surface) {
    return lookupEcdictExact(surface)
  }
  return null
}

/** @deprecated 与 lookupLocalWord 相同，保留别名 */
export async function lookupLocalWordDetailed(
  rawWord: string,
  options: LookupOptions = {},
): Promise<WordEntry | null> {
  return lookupLocalWord(rawWord, options)
}

async function cacheOnlineVariantForms(entry: WordEntry): Promise<void> {
  if (entry.source === 'ecdict') return

  const tasks = entry.forms.map(async (form) => {
    const token = extractVariantLookupWord(form.value)
    if (!token) return
    const key = normalizeWordToken(token)
    if (!key || key === entry.lemma) return
    if (await isLemmaMarkedNotFound(key)) return

    const existing = await getCachedRecord(key)
    if (isOnlineCacheEntry(existing)) return

    try {
      const variantEntry = await fetchWordFromProviders(key)
      if (variantEntry) {
        await setCachedWord(variantEntry)
        return
      }
      await setNotFoundLemma(key)
    } catch {
      // 变体预取失败不影响主词
    }
  })

  await Promise.all(tasks)
}

async function lookupOnlineSingleKey(
  key: string,
  options: LookupOptions,
): Promise<{ entry: WordEntry; fromCache: boolean } | 'miss' | 'blocked'> {
  const record = !options.forceRefresh ? await getCachedRecord(key) : null

  // 旧会话可能误写入了 ecdict，联网模式跳过，改走真联网
  if (isOnlineCacheEntry(record)) {
    return { entry: record, fromCache: true }
  }

  if (record && isWordNotFoundMarker(record) && !shouldRetryNotFound(record)) {
    return 'blocked'
  }

  try {
    const entry = await fetchWordFromProviders(key, {
      skipSources: getSkipSources(record ?? undefined),
    })
    if (!entry) return 'miss'
    await setCachedWord(entry)
    void cacheOnlineVariantForms(entry)
    void fetchFrequencyForLemmaIfMissing(entry.lemma)
    return { entry, fromCache: false }
  } catch {
    return 'miss'
  }
}

/**
 * 联网查词（有道/词霸 + IndexedDB 缓存），不读 ECDICT 释义。
 * 查询键：已还原的原型（或 exactToken 表面形）。
 */
export async function lookupOnlineWord(
  rawWord: string,
  options: LookupOptions = {},
): Promise<WordEntry | null> {
  const surface = normalizeWordToken(rawWord)
  if (!surface) return null

  const lemma = await resolveLemma(rawWord, Boolean(options.exactToken))
  const keys =
    !options.exactToken && lemma && lemma !== surface ? [lemma, surface] : [surface]

  for (const key of keys) {
    const result = await lookupOnlineSingleKey(key, options)
    if (result === 'blocked' || result === 'miss') continue
    if (key !== surface) {
      await setCachedWordAlias(surface, result.entry)
    }
    return result.entry
  }

  // 仅标记表面形 notFound，避免污染原型缓存
  await setNotFoundLemma(surface)
  return null
}

/**
 * 弹窗默认路径：本地优先；无本地再联网。
 * 注意：本地命中不写入词条缓存；仅联网结果写入。
 */
export async function lookupWordDetailed(
  rawWord: string,
  options: LookupOptions = {},
): Promise<{ entry: WordEntry; fromCache: boolean; sourceMode: 'local' | 'online' } | null> {
  const local = await lookupLocalWord(rawWord, options)
  if (local) {
    return { entry: local, fromCache: false, sourceMode: 'local' }
  }

  const online = await lookupOnlineWord(rawWord, options)
  if (online) {
    return { entry: online, fromCache: true, sourceMode: 'online' }
  }
  return null
}

export async function lookupWord(
  rawWord: string,
  options: LookupOptions = {},
): Promise<WordEntry | null> {
  const result = await lookupWordDetailed(rawWord, options)
  return result?.entry ?? null
}

/**
 * 批量补全：先 ECDICT（不写缓存）再联网（写缓存）。
 * 供行间翻译使用。
 * ECDICT 已命中时仍会补拉无联网缓存的词条，便于弹窗展示美/英音标。
 */
export async function lookupLemmasBatch(
  lemmas: string[],
  options: { prefetchVariants?: boolean } = {},
): Promise<Map<string, WordEntry>> {
  const unique = [...new Set(lemmas.filter(Boolean))]
  const found = new Map<string, WordEntry>()
  if (!unique.length) return found

  const resolved = new Map<string, string>()
  await Promise.all(
    unique.map(async (key) => {
      resolved.set(key, await resolveLemma(key, false))
    }),
  )

  const altUnique = [
    ...new Set(
      [...resolved.values()].filter((lemma) => Boolean(lemma) && !unique.includes(lemma)),
    ),
  ]
  const records = await getCachedRecords([...unique, ...altUnique])

  /** 无 ECDICT、也无联网缓存 → 联网；失败可标 notFound */
  const missingForGloss: string[] = []
  /** 已有 ECDICT 释义，但无联网缓存 → 仅补音标；失败不标 notFound */
  const missingOnlinePhonetics: string[] = []

  for (const key of unique) {
    const direct = records.get(key)
    const lemma = resolved.get(key) || toLemma(key)
    const viaLemma =
      lemma && lemma !== key ? records.get(lemma) : undefined
    const hasOnline =
      isOnlineCacheEntry(direct) || isOnlineCacheEntry(viaLemma)

    const surfaceBlocked =
      direct && isWordNotFoundMarker(direct) && !shouldRetryNotFound(direct)
    const lemmaBlocked =
      viaLemma && isWordNotFoundMarker(viaLemma) && !shouldRetryNotFound(viaLemma)
    const blocked =
      surfaceBlocked && (lemmaBlocked || !lemma || lemma === key)

    let hasLocal = false
    try {
      const local = await lookupFromEcdict(key)
      if (local) {
        found.set(key, local)
        hasLocal = true
      }
    } catch {
      // continue
    }

    if (hasOnline) {
      if (!hasLocal) {
        const online = isOnlineCacheEntry(direct) ? direct : viaLemma
        if (online && isOnlineCacheEntry(online)) found.set(key, online)
      }
      continue
    }

    if (blocked) continue

    if (hasLocal) {
      missingOnlinePhonetics.push(key)
      continue
    }

    missingForGloss.push(key)
  }

  const toFetch = [...missingForGloss, ...missingOnlinePhonetics]
  if (!toFetch.length) return found

  const phoneticOnly = new Set(missingOnlinePhonetics)
  const concurrency = 6
  let index = 0

  async function processKey(key: string): Promise<void> {
    const lemma = resolved.get(key) || key
    const candidates = lemma !== key ? [lemma, key] : [key]
    const onlyPhonetics = phoneticOnly.has(key)

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
        // 行间释义优先保留 ECDICT；仅在无本地释义时用联网结果
        if (!found.has(key)) {
          found.set(key, entry)
        }
        if (options.prefetchVariants) {
          void cacheOnlineVariantForms(entry)
        }
        return
      } catch {
        // try next
      }
    }
    // 仅「释义也缺」时标记；已有 ECDICT 的词联网失败不写 notFound
    if (!onlyPhonetics) {
      await setNotFoundLemma(key)
    }
  }

  async function worker(): Promise<void> {
    while (index < toFetch.length) {
      const key = toFetch[index++]
      await processKey(key)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, toFetch.length) }, () => worker()),
  )

  return found
}

/** 仅本地：ECDICT + 非 ecdict 的 IndexedDB 缓存，不联网、ECDICT 不写缓存 */
export async function lookupLemmasLocal(lemmas: string[]): Promise<Map<string, WordEntry>> {
  const unique = [...new Set(lemmas.filter(Boolean))]
  const found = new Map<string, WordEntry>()

  const resolved = new Map<string, string>()
  await Promise.all(
    unique.map(async (key) => {
      resolved.set(key, await resolveLemma(key, false))
    }),
  )
  const altUnique = [
    ...new Set(
      [...resolved.values()].filter((lemma) => lemma && !unique.includes(lemma)),
    ),
  ]
  const records = await getCachedRecords([...unique, ...altUnique])

  for (const key of unique) {
    try {
      const local = await lookupFromEcdict(key)
      if (local) {
        found.set(key, local)
        continue
      }
    } catch {
      // ignore
    }

    const direct = records.get(key)
    if (isOnlineCacheEntry(direct)) {
      found.set(key, direct)
      continue
    }
    const lemma = resolved.get(key) || toLemma(key)
    if (lemma && lemma !== key) {
      const viaLemma = records.get(lemma)
      if (isOnlineCacheEntry(viaLemma)) found.set(key, viaLemma)
    }
  }
  return found
}
